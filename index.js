import axios from "axios"
import { config } from "./config.js";
import totp from 'totp-generator';
import GateApi from 'gate-api'
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import crypto from "node:crypto";
import fs from 'fs'
import _ from "lodash"
import JSONdb from 'simple-json-db'
import consoleStamp from 'console-stamp';

consoleStamp(console, { format: ':date(HH:MM:ss).blue :label.green' });

const localdb = new JSONdb('db/storage.json');

const client = new GateApi.ApiClient();
client.setApiKeySecret(config.apikey, config.secret);

const generateSecret = () => totp(config["2FA_secret"])
const parseFile = fileName => fs.readFileSync(fileName, "utf8").split('\n').map(str => str.trim()).filter(str => str.length > 10);
const timeout = (msFrom, msTo = msFrom + 1) => new Promise(res => setTimeout(res, crypto.randomInt(msFrom, msTo + 1)))

const imapConfig = {
    user: config.mail,
    password: config.mailPassword,
    host: `imap.${config.mail.split('@')[1]}`,
    tls: true,
    port: 993,
    authTimeout: 30000,
    tlsOptions: {
        rejectUnauthorized: false
    },
};

async function sendEmail() {
    let params = new URLSearchParams({ 'type': 'EMAIL_WITHDRAW' })
    let res = await axios.post(`https://www.gate.io/email`, params, { headers: config.headers })
    console.log(`Send email status:`, res.data?.msg);

    if (!res.data.result) {
        console.log('Жду пару минут');
        await timeout(200000)
        return await sendEmail()
    }
}

async function getEmails(timeSent) {
    try {
        return new Promise((resolve, reject) => {
            const imap = new Imap(imapConfig);
            imap.once('ready', () => {
                imap.openBox('INBOX', false, () => {
                    imap.search(['UNSEEN'], (err, results) => {
                        if (results.length > 0) {
                            const f = imap.fetch(results, { bodies: '' });
                            f.on('message', msg => {
                                msg.on('body', stream => {
                                    simpleParser(stream, async (err, parsed) => {
                                        let mail = {
                                            subject: parsed.headers.get('subject'),
                                            html: parsed.html,
                                            time: new Date(parsed.date).getTime()
                                        }

                                        if (mail.subject.includes('WITHDRAW email verification') && mail.time >= timeSent) {
                                            resolve(mail.html.match(/<strong>([0-9]{1,6})<\/strong>/)[1])
                                            imap.end();
                                        }
                                    });
                                });
                                msg.once('attributes', attrs => {
                                    const { uid } = attrs;
                                    imap.addFlags(uid, ['\\Seen'], () => { });
                                });
                            });
                            f.once('error', ex => {
                                console.log(ex);
                            });
                            f.once('end', () => {
                                // console.log('Done fetching all messages!');
                                imap.end();
                            });
                        } else {
                            console.log('Письмл пока не пришло');
                            resolve(0)
                        }
                    });
                });
            });

            imap.once('error', err => {
                console.log(err);
            });

            imap.once('end', () => {
                // console.log('Connection ended');
            });

            imap.connect();
        })
    } catch (err) {
        console.log('EMAIL ERROR', err);
        await timeout(5000)
        return await getEmails()
    }
}


async function waitForCode(timeSent) {
    let startTime = Date.now();

    while (true) {
        let code = await getEmails(timeSent)

        if (code > 100) {
            return code
        } else await timeout(5000, 10000)

        if (Date.now() > startTime + (1 * 60 * 1000)) {
            console.log('Переотправляю письмо');
            await sendEmail(Date.now())
        }
    }
}


async function getWalletsList() {
    try {
        let params = new URLSearchParams({
            'type': 'get_withdraw_address_list',
            'curr_type': '',
            'verified': '',
            'address': '',
            'pageIndex': '1'
        })

        let res = await axios.post(`https://www.gate.io/json_svr/query?u=115`, params, { headers: config.headers })
        return res.data.datas.list;
    } catch (err) {
        console.log(err);
    }
}

async function deleteWallets() {
    try {
        let trustedWallets = await getWalletsList();
        let ids = trustedWallets.map(e => e.id).join(',');

        if (trustedWallets.length > 0) {
            let params = new URLSearchParams({
                'type': 'del_withdraw_address',
                'id': ids,
                'uid': trustedWallets[0].uid
            })

            let res = await axios.post(`https://www.gate.io/json_svr/exchange?u=116`, params, { headers: config.headers })

            console.log(`Delete status: ${res.data.msg}`);
        }
    } catch (err) {
        console.log(err);
    }
}


async function addWallets(walletsList) {
    try {
        let time = Date.now();
        await sendEmail();
        await timeout(10000)
        let mailCode = await waitForCode(time);
        let addresses = walletsList.join('@');
        let chains = Array(walletsList.length).fill(config.chain).join('@');
        let coins = Array(walletsList.length).fill(config.coin).join('@');
        let names = Array(walletsList.length).fill(config.coin).join('@');
        let addressTag = Array(walletsList.length - 1).fill('@').join('');

        let params = new URLSearchParams({
            'curr_type': coins,
            'chain': chains,
            'addr': addresses,
            'receiver_name': names,
            'address_tag': addressTag,
            'batch_sub': '1',
            'type': 'set_withdraw_address',
            'totp': generateSecret(),
            'emailcode': mailCode,
            'fundpass': config.fundPass,
            'verified': '1',
            'is_universal': '1'
        })

        console.log(`Adding ${walletsList.length} wallets`);
        let res = await axios.post('https://www.gate.io/json_svr/query', params, { headers: config.headers })
        console.log(`Add status:`, res.data.result);

        if (res.data.result) {
            walletsList.forEach(address => localdb.set(address, { add: true, withdraw: false }))
        }
        return res.data.result
    } catch (err) {
        console.log(err);
    }
}

async function getCoinChains() {
    const gate = new GateApi.WalletApi(client);
    let data = await gate.listCurrencyChains(config.coin)
    return data.body.map(e => e.chain)
}


(async function start() {
    let wallets = parseFile('wallets.txt');

    let allChains = await getCoinChains()
    if (!allChains.includes(config.chain)) {
        return console.log(`Available chains: ${allChains.join(', ')}`)
    }

    let count = 10;
    for (let i = 0; i < wallets.length; i += count) {
        let batch = wallets.slice(i, i + count)
        let isAdded = await addWallets(batch);

        if (isAdded) {
            await timeout(10000)
            for (let wallet of batch) {
                let amount = (config.amount * (_.random(1 - (config.spread / 100), 1))).toFixed(_.random(config.decimals.from, config.decimals.to))
                console.log(`Withdrawing ${amount} ${config.coin} to ${wallet}`);

                const gate = new GateApi.WithdrawalApi(client);
                await gate.withdraw({
                    currency: config.coin,
                    amount: amount,
                    chain: config.chain,
                    address: wallet
                }).then(() => {
                    localdb.set(wallet, { add: true, withdraw: true })
                }).catch(err => console.log(err.response?.data?.message || err))

                await timeout(config.delay.from * 1000, config.delay.to * 1000)
            }

            await deleteWallets()
            await timeout(5000)
        }
    }
    process.exit(0)
})()