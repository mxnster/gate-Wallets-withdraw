export const config = {
    "coin": 'MEME',
    "chain": 'ETH', // если указать неверную сеть, то бот подскажет доступные сети
    "amount": '100',
    "spread": '2', // разброс рандомности суммы в процентах
    "decimals": { from: 0, to: 2 }, // количество цифр после запятой
    "delay": { from: 30, to: 60 }, // задержка между выводами
    "apikey": '', // создать тут https://www.gate.io/myaccount/api_key_manage
    "secret": '',
    "fundPass": '', // торговый пароль
    "2FA_secret": '', // пишется при подключении 2фа, чтобы узнать придется пересоздать код
    "mail": 'jopa@gmail.com', // почта
    "mailPassword": '', // пароль, для gmail другое, можно погуглить imap 'mailService'
    "headers": { 
        'authority': 'www.gate.io',
        'accept': '*/*',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'cookie': '',
        'csrftoken': '',
        'dnt': '1',
        'origin': 'https://www.gate.io',
        'referer': 'https://www.gate.io/myaccount/withdraw_address/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-requested-with': 'XMLHttpRequest'
    }
}