import { convertCard, convertTransaction, parseDescription } from './converters'

describe('convertCard', () => {
  it('converts a credit card', () => {
    expect(convertCard({
      'account': '40817810550006885012',
      'openDate': '2018-10-03',
      'exp_date': '4012-12-31',
      'name': 'Карта рассрочки "Халва " - Сайт, депозитный',
      'name_sh': '+INSTALLMENT_CRD_2_SI_DEP',
      'sum': 78000,
      'sum_pp': 78000,
      'sum_acc': 3000,
      'accType': 'card',
      'cardCredit': 1,
      'cardCreditContractNumber': '1879272874',
      'installmentType': 'Halva2',
      'creditLimit': 75000,
      'unusedCreditLimit': 75000,
      'isRepayment': 1,
      'cardName': 'MC WORLD ХАЛВА 2.0 СНЯТИЕ',
      'cardBin': '553609',
      'cardEnd': '6549',
      'cardExpDate': '2023-03-31',
      'cardStat': 'ACT',
      'cardType': 1,
      'cardSys': 'International',
      'cardVirt': 0,
      'productId': '1671282625',
      'cardsCount': 1,
      'cardPINchangeCall': 0,
      'bank': {
        'bic': '045004763',
        'corrAccNum': '30101810150040000763',
        'name': 'ФИЛИАЛ "ЦЕНТРАЛЬНЫЙ" ПАО "СОВКОМБАНК"',
        'city': 'БЕРДСК',
        'branchId': '62384355'
      },
      'credit_info': {
        'widgetType': 'product',
        'account': 'produ8101879272874',
        'accNum': '45509810850102522328',
        'sum': 0.1,
        'installmentCard': 1,
        'product': {
          'type': 'potreb',
          'subType': 'card',
          'contNum': '1879272874',
          'contDate': '2015-09-25',
          'contExpiredDate': '2025-09-25',
          'head': 'Карта рассрочки'
        },
        'endPowerdate': '2025-09-25'
      },
      'sum_own': 3000,
      'ownerNameEng': '',
      'ownerName': 'Сычкин Константин Владимирович',
      'inn': '',
      'kpp': '',
      'ownerAddress': '195276, САНКТ-ПЕТЕРБУРГ ОБЛ, . САНКТ-ПЕТЕРБУРГ, .СУЗДАЛЬСКИЙ, д.75, кв.70',
      'ownerAddressEng': '. .b.',
      'abs_i': 'Константин',
      'abs_o': 'Владимирович',
      'abs_f': 'Сычкин',
      'bank_part_id': '',
      'pay': 1,
      'create': 1,
      'dov_date': 'owner',
      'cType': '',
      'uid': '1780033',
      'isOwner': '1',
      'ownerIcon': '',
      'owner_uid': '1780033'
    })).toEqual({
      id: '40817810550006885012',
      type: 'ccard',
      title: 'Халва',
      instrument: 'RUB',
      balance: 3000,
      creditLimit: 75000,
      syncID: [
        '553609******6549',
        '40817810550006885012'
      ]
    })
  })
})

describe('convertTransaction', () => {
  it('converts an income', () => {
    expect(convertTransaction({
      'abs_tid': 'M15099074452',
      'account': '30233810350110021459',
      'bank': 'ФИЛИАЛ "ЦЕНТРАЛЬНЫЙ" ПАО "СОВКОМБАНК"',
      'bic': '045004763',
      'credit': 3000,
      'debit': 0,
      'desc': 'Платеж. Авторизация №002684493452 Дата 2018.10.04 09:10 Описание: RU,MOSCOW  RUS',
      'desc_sh': 'Платеж. Авторизация №002684493452 Дата 2018.10.04 09:10 Описание: RU,MOSCOW',
      'id': 'b6bdd0dda4ccce6d8c3840c77eaa806c',
      'inn': '4401116480',
      'kpp': '',
      'mcc': '',
      'name': 'ФИЛИАЛ "ЦЕНТРАЛЬНЫЙ" ПАО "СОВКОМБАНК"',
      'num': '0044',
      'oper': '01',
      'sortDate': '2018-10-04 09:30:07',
      'stat': 2,
      'sum': 3000,
      'sum_issue': 0,
      'trnstate': 0
    }, { id: 'account' })).toEqual({
      id: 'b6bdd0dda4ccce6d8c3840c77eaa806c',
      hold: false,
      date: new Date('2018-10-04T09:30:07+03:00'),
      income: 3000,
      incomeAccount: 'account',
      outcome: 0,
      outcomeAccount: 'account'
    })
  })

  it('converts an outcome with a payee', () => {
    expect(convertTransaction({ num: '',
      sortDate: '2018-10-04 21:30:53',
      sum: 1050,
      sum_issue: 0,
      desc: 'Покупка MD00PYATEROCHKA 6123 CHEBOKSARY RUS',
      account: '',
      bic: '',
      name: '',
      inn: '',
      bank: '',
      mcc: '5411',
      oper: 'A',
      stat: 2,
      trnstate: 0,
      id: '9406fdb20a58e2e3ad7e9eebb47f9723',
      desc_sh: '',
      debit: 1050,
      credit: 0,
      kpp: '',
      hold: 1,
      cardEnd: '4623',
      abs_tid: 'A1349928983#951194201827777453'
    }, { id: 'account' })).toEqual({
      id: '9406fdb20a58e2e3ad7e9eebb47f9723',
      date: new Date('2018-10-04T21:30:53+03:00'),
      hold: true,
      income: 0,
      incomeAccount: 'account',
      outcome: 1050,
      outcomeAccount: 'account',
      payee: 'PYATEROCHKA 6123',
      mcc: 5411
    })
  })
})

describe('parseDescription', () => {
  it('parses different descriptions', () => {
    expect(parseDescription('Покупка MD00PYATEROCHKA 6123 CHEBOKSARY RUS')).toEqual({
      payee: 'PYATEROCHKA 6123'
    })
    expect(parseDescription('Покупка YANDEX TAXI MOSCOW RUS')).toEqual({
      payee: 'YANDEX TAXI'
    })
    expect(parseDescription('Покупка Tortik 11 Baikonur CHEBOXARY G RUS')).toEqual({
      payee: 'Tortik 11 Baikonur'
    })
    expect(parseDescription('Платеж. Авторизация №827615579638 Дата 2018.10.03 18:10 Описание: RU,MOSCOW  RUS')).toEqual({})
  })
})