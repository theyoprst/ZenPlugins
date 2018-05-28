import {MD5} from "jshashes";
import _ from "lodash";
import {toAtLeastTwoDigitsString} from "../../common/dates";
import * as network from "../../common/network";
import {parseDate} from "./converters";

const qs = require("querystring");
const md5 = new MD5();

const baseUrl = "https://node1.online.sberbank.ru:4477/mobile9/private";
const deviceName = "Xperia Z2";
const version = "9.20";
const appVersion = "7.11.1";

const defaultHeaders = {
    "User-Agent": "Mobile Device",
    "Content-Type": "application/x-www-form-urlencoded",
    "Host": "node1.online.sberbank.ru:4477",
    "Connection": "Keep-Alive",
    "Accept-Encoding": "gzip",
};

export async function login(login, pin) {
    if (!ZenMoney.getData("devID")) {
        ZenMoney.setData("devID", getUid(36) + "0000");
        ZenMoney.setData("devIDOld", getUid(36) + "0000");
    }

    const commonBody = {
        "version": version,
        "appType": "android",
        "appVersion": appVersion,
        "deviceName": deviceName,
    };

    let response;
    if (ZenMoney.getData("mGUID")) {
        response = await fetchXml("https://online.sberbank.ru:4477/CSAMAPI/login.do", {
            body: {
                ...commonBody,
                "operation": "button.login",
                "mGUID": ZenMoney.getData("mGUID"),
                "password": pin,
                "isLightScheme": false,
                "devID": ZenMoney.getData("devID"),
                "mobileSdkData": JSON.stringify(createSdkData(login)),
            },
            sanitizeRequestLog: {body: {mGUID: true, password: true, devID: true, mobileSdkData: true}},
            sanitizeResponseLog: {body: {loginData: {token: true}}},
        }, null);
        if (_.get(response, "body.status.code") === "7") {
            ZenMoney.setData("mGUID", null);
        } else {
            validateResponse(response, response => _.get(response, "body.status.code") === "0");
        }
    }

    if (!ZenMoney.getData("mGUID")) {
        response = await fetchXml("https://online.sberbank.ru:4477/CSAMAPI/registerApp.do", {
            body: {
                ...commonBody,
                "operation": "register",
                "login": login,
                "devID": ZenMoney.getData("devID"),
                "devIDOld": ZenMoney.getData("devIDOld"),
            },
            sanitizeRequestLog: {body: {login: true, devID: true, devIDOld: true}},
            sanitizeResponseLog: {body: {confirmRegistrationState: {mGUID: true}}},
        }, response => _.get(response, "body.confirmRegistrationStage.mGUID"));

        ZenMoney.setData("mGUID", response.body.confirmRegistrationStage.mGUID);

        if (_.get(response, "body.confirmInfo.type") === "smsp") {
            const code = await ZenMoney.readLine("Введите пароль регистрации из СМС для подключения импорта операций из Сбербанк Онлайн для Android", {
                time: 120000,
                inputType: "number",
            });
            if (!code || !code.trim()) {
                throw new TemporaryError("Получен пустой код авторизации устройства");
            }
            response = await fetchXml("https://online.sberbank.ru:4477/CSAMAPI/registerApp.do", {
                body: {
                    "operation": "confirm",
                    "mGUID": ZenMoney.getData("mGUID"),
                    "smsPassword": code,
                    "version": version,
                    "appType": "android",
                },
                sanitizeRequestLog: {body: {mGUID: true, smsPassword: true}},
            }, null);
            if (_.get(response, "body.status.code") === "1") {
                throw new TemporaryError("Вы ввели неправильный идентификатор или пароль из SMS. Повторите подключение импорта.");
            }
        }

        response = await fetchXml("https://online.sberbank.ru:4477/CSAMAPI/registerApp.do", {
            body: {
                ...commonBody,
                "operation": "createPIN",
                "mGUID": ZenMoney.getData("mGUID"),
                "password": pin,
                "isLightScheme": false,
                "devID": ZenMoney.getData("devID"),
                "devIDOld": ZenMoney.getData("devIDOld"),
                "mobileSdkData": JSON.stringify(createSdkData(login)),
            },
            sanitizeRequestLog: {body: {mGUID: true, password: true, devID: true, devIDOld: true, mobileSdkData: true}},
            sanitizeResponseLog: {body: {loginData: {token: true}}},
        });
    }

    validateResponse(response, response =>
        _.get(response, "body.loginData.token") &&
        _.get(response, "body.loginData.host"));

    const token = response.body.loginData.token;
    const host = response.body.loginData.host;

    response = await fetchXml(`https://${host}:4477/mobile9/postCSALogin.do`, {
        headers: {
            ...defaultHeaders,
            "Host": `${host}:4477`,
        },
        body: {
            "token": token,
            "appName": "????????",
            "appBuildOSType": "android",
            "appBuildType": "RELEASE",
            "appFormat": "STANDALONE",
            "deviceType": "Android SDK built for x86_64",
            "deviceOSType": "android",
            "deviceOSVersion": "6.0",
            "appVersion": appVersion,
            "deviceName": deviceName,
        },
        sanitizeRequestLog: {body: {token: true}},
        sanitizeResponseLog: {body: {person: true}, headers: {"Set-Cookie": true}},
    }, response => _.get(response, "body.loginCompleted") === "true");

    return response.body.person;
}

export async function fetchAccounts() {
    const response = await fetchXml("products/list.do", {
        headers: {
            ...defaultHeaders,
            "Content-Type": "application/x-www-form-urlencoded;charset=windows-1251",
        },
        body: {showProductType: "cards,accounts,imaccounts,loans"},
    });
    const types = ["card", "account", "loan"];
    return (await Promise.all(types.map(type => {
        return Promise.all(getArray(_.get(response.body, `${type}s.${type}`)).map(async account => {
            return {
                account: account,
                details: account.mainCardId
                    ? null
                    : await fetchAccountDetails(account.id, type),
            };
        }));
    }))).reduce((accounts, objects, i) => {
        accounts[types[i]] = objects;
        return accounts;
    }, {});
}

async function fetchAccountDetails(accountId, type) {
    const response = await fetchXml(`${type}s/info.do`, {
        headers: {
            ...defaultHeaders,
            "Content-Type": "application/x-www-form-urlencoded;charset=windows-1251",
        },
        body: {id: accountId},
    }, response => _.get(response, "body.detail"));
    return response.body;
}

export async function fetchTransactions({id, type}, fromDate, toDate) {
    const isFetchingByDate = type !== "card";
    const response = await fetchXml(`${type}s/abstract.do`, {
        headers: {
            ...defaultHeaders,
            "Referer": `Android/6.0/${appVersion}`,
        },
        body: isFetchingByDate
            ? {id, from: formatDate(fromDate), to: formatDate(toDate)}
            : {id, count: 10, paginationSize: 10},
    }, response => response => _.get(response, "body.operations"));
    let transactions = getArray(_.get(response, "body.operations.operation"));
    if (!isFetchingByDate) {
        transactions = transactions.filter(transaction => {
            const date = new Date(parseDate(transaction.date));
            return date >= fromDate && date <= toDate;
        });
    }
    return transactions;
}

async function fetchXml(url, options = {}, predicate = () => true) {
    if (url.substr(0, 4) !== "http") {
        if (url.substr(0, 1) !== "/") {
            url = "/" + url;
        }
        url = baseUrl + url;
    }
    options = {
        method: "POST",
        headers: defaultHeaders,
        ...options,
        stringify: qs.stringify,
        parse: network.parseXml,
    };
    if (typeof _.get(options, "sanitizeResponseLog.body") === "object") {
        options.sanitizeResponseLog.body = {response: options.sanitizeResponseLog.body};
    }
    const response = await network.fetch(url, options);
    if (response.body && response.body.response) {
        response.body = response.body.response;
    }

    if (predicate) {
        validateResponse(response, response => _.get(response, "body.status.code") === "0" && predicate(response));
    }

    return response;
}

function validateResponse(response, predicate) {
    console.assert(!predicate || predicate(response), "non-successful response");
}

function getArray(object) {
    return object === null || object === undefined
        ? []
        : Array.isArray(object) ? object : [object];
}

function formatDate(date) {
    return [date.getDate(), date.getMonth() + 1, date.getFullYear()].map(toAtLeastTwoDigitsString).join(".");
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getUid(length, chars) {
    if (typeof chars !== "string") {
        chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    }
    const buf = [];
    for (let i = 0; i < length; i++) {
        buf.push(chars[getRandomInt(0, chars.length - 1)]);
    }
    return buf.join("");
}

function generateHex(mask, digits) {
    let i = 0;
    return mask.replace(/x/ig, () => {
        return digits[i++];
    });
}

function createSdkData(login) {
    const dt = new Date();
    const hex = md5.hex(login + "sdk_data");
    const rsa_app_key = md5.hex(login + "rsa app key").toUpperCase();

    let imei = ZenMoney.getData("imei");
    if (!imei) {
        imei = generateImei(login, "35472406******L");
    }

    let simId = ZenMoney.getData("simId");
    if (!simId) {
        simId = generateSimSN(login, "2500266********L");
    }

    const obj = {
        "TIMESTAMP": dt.getUTCFullYear() + "-"
            + toAtLeastTwoDigitsString(dt.getUTCMonth()) + "-"
            + toAtLeastTwoDigitsString(dt.getUTCDate()) + "T"
            + dt.getUTCHours() + ":" + dt.getUTCMinutes() + ":" + dt.getUTCSeconds() + "Z",
        "HardwareID": imei,
        "SIM_ID": simId,
        "PhoneNumber": "",
        "GeoLocationInfo": [
            {
                "Longitude": (37.0 + Math.random()).toString(10),
                "Latitude": (55.0 + Math.random()).toString(10),
                "HorizontalAccuracy": "5",
                "Altitude": (150 + Math.floor(Math.random() * 20)).toString(10),
                "AltitudeAccuracy": "5",
                "Timestamp": (dt.getTime() - Math.floor(Math.random() * 1000000)).toString(10),
                "Heading": (Math.random() * 90).toString(10),
                "Speed": "3",
                "Status": "3",
            },
        ],
        "DeviceModel": "D6503",
        "MultitaskingSupported": true,
        "deviceName": deviceName,
        "DeviceSystemName": "Android",
        "DeviceSystemVersion": "22",
        "Languages": "ru",
        "WiFiMacAddress": generateHex("44:d4:e0:xx:xx:xx", hex.substr(0, 6)),
        "WiFiNetworksData": {
            "BBSID": generateHex("5c:f4:ab:xx:xx:xx", hex.substr(6, 12)),
            "SignalStrength": Math.floor(-30 - Math.random() * 20).toString(10),
            "Channel": "null",
            "SSID": "TPLink",
        },
        "CellTowerId": (12875 + Math.floor(Math.random() * 10000)).toString(10),
        "LocationAreaCode": "9722",
        "ScreenSize": "1080x1776",
        "RSA_ApplicationKey": rsa_app_key,
        "MCC": "250",
        "MNC": "02",
        "OS_ID": hex.substring(12, 16),
        "SDK_VERSION": "2.0.1",
        "Compromised": 0,
        "Emulator": 0,
    };

    ZenMoney.setData("imei", imei);
    ZenMoney.setData("simId", simId);

    return obj;
}

function generateImei(val, mask) {
    const g_imei_default = "35374906******L"; //Samsung
    const serial = String(Math.abs(crc32(val) % 1000000));

    if (!mask) {
        mask = g_imei_default;
    }

    mask = mask.replace(/\*{6}/, serial);
    mask = mask.replace(/L/, luhnGet(mask.replace(/L/, "")));

    return mask;
}

function generateSimSN(val, mask) {
    const g_simsn_default = "897010266********L"; //билайн
    const serial = (Math.abs(crc32(val + "simSN") % 100000000)).toString(10);

    if (!mask) {
        mask = g_simsn_default;
    }

    mask = mask.replace(/\*{8}/, serial);
    mask = mask.replace(/L/, luhnGet(mask.replace(/L/, "")));

    return mask;
}

function crc32(str) {
    function makeCRCTable() {
        let c;
        const crcTable = [];
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crcTable[n] = c;
        }
        return crcTable;
    }

    const crcTable = makeCRCTable();
    let crc = 0 ^ (-1);

    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0;
}

function luhnGet(num) {
    const arr = [];
    num = num.toString();
    for (let i = 0; i < num.length; i++) {
        if (i % 2 === 0) {
            const m = parseInt(num[i], 10) * 2;
            if (m > 9) {
                arr.push(m - 9);
            } else {
                arr.push(m);
            }
        } else {
            const n = parseInt(num[i], 10);
            arr.push(n);
        }
    }

    const summ = arr.reduce((a, b) => {
        return a + b;
    });
    return (summ % 10);
}