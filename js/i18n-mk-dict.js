/* ══════════════════════════════════════════════════════════════════
   i18n-mk-dict.js — the Macedonian strings for i18n-mk.js (promptove/73)

   Keys are the English exactly as it appears on the page, with runs of
   whitespace folded to one space. Grouped by where they appear. Numbers
   and templates are in MK_PATTERNS at the bottom.
   Glossary: copy/glossary-mk.md.  Reviewer: Daniel.
══════════════════════════════════════════════════════════════════ */

/* ── Top bar, rail, section headers ─────────────────────────────── */
Object.assign(MK_TEXT, {
  '⬡ ROTATOR — Market Pulse for Binance': '⬡ ROTATOR — Пазарен пулс за Binance',
  'Section navigation': 'Навигација по секции',
  'SORT': 'РЕД',
  'every coin we score, ranked; open one to see its score and relative strength': 'секоја монета што ја оценуваме, рангирана; отворете ја за да ги видите оценката и релативната сила',
  'TODAY': 'ДЕНЕС', 'MOMENTUM': 'МОМЕНТУМ', 'RECORD': 'ЕВИДЕНЦИЈА', 'YOURS': 'ВАШЕ', 'COINS': 'МОНЕТИ', 'SWAP': 'ЗАМЕНА',
  'on-chain now': 'на синџирот сега', 'what held up': 'што издржа', 'holdings and warnings': 'позиции и предупредувања',
  'start here: where the market\'s momentum is right now': 'почнете тука: каде е моментумот на пазарот во моментов',
  'what ran ahead, what lagged behind, and which coins are turning': 'што предничеше, што заостана и кои монети се свртуваат',
  'every observation published, and what happened next': 'секое објавено набљудување, и што следеше потоа',
  'learn more: how our readings have held up so far': 'дознајте повеќе: колку издржаа нашите читања досега',
  'Our old engine': 'Нашиот стар мотор', '(April to September 2026) was confirmed on': '(април до септември 2026) беше потврден кај',
  '76.2% of 863 graded calls': '76,2% од 863 оценети повици',
  '. That grading was generous: it counted the best price reached inside a 7 to 14 day window, where calling every coin would have scored about 68%. Read it as an upper bound, roughly 8 points better than chance.':
    '. Тоа оценување беше великодушно: ја земаше најдобрата цена достигната во период од 7 до 14 дена, каде што повик за секоја монета би постигнал околу 68%. Читајте го како горна граница, околу 8 поени подобро од случајноста.',
  'The current engine': 'Сегашниот мотор',
  'is held to a stricter test: a call counts only if the coin beats the median coin over the next 30 days, where chance is 50%. It started on 11 September, so its first results arrive from 11 October. Until then there is nothing to claim yet.':
    'се мери со построг тест: повикот се брои само ако монетата ја надмине просечната монета во следните 30 дена, каде што случајноста е 50%. Започна на 11 септември, па првите резултати стигнуваат од 11 октомври. Дотогаш сè уште нема што да тврдиме.',
  'track what you hold and watch; warnings and notifications follow your coins': 'следете што држите и набљудувате; предупредувањата и известувањата ги следат вашите монети',
  'turn part of a holding into BTC, or any coin you prefer, and see what the swap gives you': 'претворете дел од позицијата во BTC или во монета по ваш избор и видете што ви дава замената',
  'Search': 'Пребарај', 'Settings': 'Поставки', 'Dismiss': 'Затвори', 'Close': 'Затвори',
  'Search coins': 'Пребарај монети', 'Search coins, forex, stocks…': 'Пребарај монети, форекс, акции…',
  'Download App': 'Преземи апликација', 'Mobile App': 'Мобилна апликација', 'Desktop App': 'Десктоп апликација',
  'Alerts for your coins': 'Известувања за вашите монети', 'Signal Assistant': 'Асистент за сигнали',
  'Buy Me a Coffee': 'Купете ми кафе', 'About Rotator': 'За Rotator', 'Toggle light/dark theme': 'Светла/темна тема',
  'Keep Rotator free': 'Rotator да остане бесплатен', 'keep it free': 'нека остане бесплатен', 'Unlock Pro': 'Отклучи Pro',
  'Support Rotator': 'Поддржи го Rotator',
  'Rotator — an honest market pulse for Binance traders: crypto and tokenized stock scores, portfolio tracking and holder warnings':
    'Rotator — искрен пазарен пулс за трговците на Binance: резултати за крипто и токенизирани акции, следење на портфолиото и предупредувања за сопствениците',
  'BTC trend — tap to refresh': 'Тренд на BTC — допрете за освежување',
  'BTC is below its 200-day moving average.': 'BTC е под својот 200-дневен подвижен просек.',
  'BTC is above its 200-day moving average.': 'BTC е над својот 200-дневен подвижен просек.',
  'BEAR MARKET CAUTION:': 'ВНИМАНИЕ, МЕЧКИН ПАЗАР:',
  'This website uses dynamic scaling. Use': 'Оваа страница користи динамично скалирање. Користете',
  'to adjust the layout to your liking.': 'за да го прилагодите изгледот по ваш вкус.',
  'Menu': 'Мени', 'Crypto Screener': 'Крипто скринер', 'Support the Project': 'Поддржи го проектот',
  'Light Mode': 'Светол режим', 'Install App': 'Инсталирај апликација', 'About': 'За нас',
  'FEAR & GREED INDEX': 'ИНДЕКС НА СТРАВ И АЛЧНОСТ',
  'Hover to pause': 'Задржете го покажувачот за пауза',
  'Loading market movers…': 'Се вчитуваат движењата на пазарот…',
});

/* ── TODAY: briefing ────────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Gold': 'Злато', 'The oldest store of value, as a benchmark': 'Најстарата вредност за чување, како репер',
  'Silver': 'Сребро', 'Industrial demand as well as a metal': 'Индустриска побарувачка, а не само метал',
  'Oil · WTI': 'Нафта · WTI', 'WTI crude — input cost for the real economy': 'Сурова нафта WTI — влезен трошок за реалната економија',
  'Dollar index': 'Индекс на доларот', 'A rising dollar is a headwind for risk assets': 'Доларот што расте е спротивен ветер за ризичните средства',
  'Hash rate': 'Хаш-моќ', 'Active addresses': 'Активни адреси',
  'DeFi TVL': 'DeFi TVL', 'Value locked across every tracked chain': 'Заклучена вредност на сите следени синџири',
  'Stablecoin supply': 'Понуда на стејблкоини', 'Dollars sitting on-chain, unallocated': 'Долари што стојат на синџирот, нераспоредени',
  'Computing power securing Bitcoin, averaged over 7 days. The daily figure is inferred from blocks found, so one day alone carries about 7% of noise — the line below is the raw daily estimate and shows that spread.':
    'Пресметковната моќ што го обезбедува Bitcoin, просек за 7 дена. Дневната бројка се изведува од пронајдените блокови, па еден ден сам по себе носи околу 7% шум — линијата подолу е суровата дневна проценка и го покажува тоа отстапување.',
  'Bitcoin addresses used per day, averaged over 7 days. Weekends run well below midweek, so a single day reports partly which day of the week it is.':
    'Bitcoin адреси користени дневно, просек за 7 дена. Викендите се значително под средината на неделата, па еден ден делумно кажува кој ден од неделата е.',
  'updated in the last hour': 'ажурирано во последниот час',
});

/* ── MOMENTUM: turn signs, hot and weakest ──────────────────────── */
Object.assign(MK_TEXT, {
  'Turn signs across the market': 'Знаци за свртување низ пазарот',
  'PRO shows all': 'PRO ги прикажува сите',
  "Coins that have lagged and now show turn-up signs, and coins that have run ahead and now show cooling signs. The same reading as each coin's window; tap a coin to open it.":
    'Монети што заостанале, а сега покажуваат знаци за свртување нагоре, и монети што истрчале напред, а сега покажуваат знаци на смирување. Истото читање како во прозорецот на секоја монета; допрете монета за да ја отворите.',
  'Lagged, turn-up signs': 'Заостанати, знаци за свртување нагоре',
  'Ran ahead, cooling signs': 'Истрчани напред, знаци на смирување',
  'No lagging coin shows a turn-up sign right now.': 'Во моментов ниту една заостаната монета не покажува знак за свртување нагоре.',
  'No leading coin shows a cooling sign right now.': 'Во моментов ниту една водечка монета не покажува знак на смирување.',
  'Show fewer': 'Прикажи помалку', 'held': 'држите',
  'How far to trust this': 'Колку да му се верува на ова',
  "What's Hot — strongest and weakest": 'Што е актуелно — најсилни и најслаби',
  'High Momentum': 'Висок моментум', 'Worst 30d Performers': 'Најлоши за 30 дена',
  'Click for details': 'Кликнете за детали', 'Add holdings to get signals': 'Додадете позиции за да добивате сигнали',
  'Add holdings to receive signals': 'Додадете позиции за да добивате сигнали',
  'SUPPORTERS': 'ПОДДРЖУВАЧИ',
  'Scanning — no coins above momentum threshold right now.': 'Пребарување — во моментов нема монети над прагот на моментум.',
});

/* ── Turn signs (same words in the list, the alerts and the coin window) ── */
Object.assign(MK_TEXT, {
  'Golden cross': 'Златен крст', 'Death cross': 'Крст на смртта',
  'Quick RSI bounce': 'Брз RSI отскок', 'Slow RSI bounce': 'Бавен RSI отскок', 'RSI back above 30': 'RSI повторно над 30',
  'Crowded shorts': 'Преполни шорт позиции', 'Crowded longs': 'Преполни лонг позиции',
  'Momentum slowing': 'Моментумот забавува', 'Decline slowing': 'Падот забавува', 'Decline speeding up': 'Падот забрзува',
  'Running hot': 'Прегреано', 'Overbought': 'Прекупено', 'Oversold': 'Препродадено',
  'Rally on short covering': 'Раст од затворање шорт позиции',
  'Heavy aggressive buying': 'Силно агресивно купување', 'Heavy aggressive selling': 'Силна агресивна продажба',
  'Big 24-hour jump': 'Голем скок за 24 часа', 'Whole market oversold': 'Целиот пазар е препродаден',
  '60-day average crossed above the 125-day': '60-дневниот просек мина над 125-дневниот',
  '60-day average crossed below the 125-day. Tested, it was not a warning': '60-дневниот просек падна под 125-дневниот. Тестирано, не беше предупредување',
  'Longs paying heavily to stay in': 'Лонг позициите плаќаат многу за да останат',
  'Shorts paying longs': 'Шорт позициите им плаќаат на лонг',
  'latest close': 'последно затворање', 'now': 'сега', 'this week': 'оваа недела', 'today': 'денес', '24 hours': '24 часа',
});

/* ── Signal track record ────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Signal Track Record': 'Евиденција на сигналите',
  'View the full public track record →': 'Погледнете ја целата јавна евиденција →',
});

/* ── YOURS: alerts, portfolio signal, holdings, score gaps ──────── */
Object.assign(MK_TEXT, {
  'Mark all read': 'Означи сè како прочитано',
  'Add a holding or watch a coin, and changes to it show up here: exchange warnings, big unlocks, and new turn signs.':
    'Додадете позиција или следете монета, и промените кај неа ќе се појават тука: предупредувања од берзата, големи отклучувања и нови знаци за свртување.',
  'Nothing to flag on your coins right now.': 'Во моментов нема ништо за истакнување кај вашите монети.',
  'Get these on Telegram': 'Добивај ги на Telegram',
  'Notify me in this browser': 'Извести ме во овој прелистувач',
  'Turn off browser notifications': 'Исклучи ги известувањата во прелистувачот',
  'Browser notifications fire while Rotator is open in a tab. "New" is remembered in this browser.':
    'Известувањата во прелистувачот се појавуваат додека Rotator е отворен во јазиче. „Ново“ се памети во овој прелистувач.',
  'Exchange and unlock warnings are free. Pro adds turn signs, ETF alerts, Telegram messages and browser notifications.':
    'Предупредувањата од берзата и за отклучувања се бесплатни. Pro додава знаци за свртување, известувања за ETF, пораки на Telegram и известувања во прелистувачот.',
  'Telegram connected. New alerts are messaged to you daily.': 'Telegram е поврзан. Новите известувања ви стигнуваат секој ден.',
  'Disconnect': 'Исклучи',
  'Telegram disconnected.': 'Telegram е исклучен.',
  'In Telegram, tap Start. This panel updates once the bot confirms.': 'Во Telegram, допрете Start. Овој панел се ажурира откако ботот ќе потврди.',
  'Our server does not have Pro on record for this browser. Restore Pro with your recovery key, then try again.':
    'Нашиот сервер нема евидентиран Pro за овој прелистувач. Вратете го Pro со вашиот клуч за враќање, па обидете се повторно.',
  'The Telegram bot is not reachable right now. Try again in a few minutes.': 'Ботот на Telegram во моментов не е достапен. Обидете се повторно за неколку минути.',
  'Binance delisting announced': 'Binance најави отстранување од листата',
  'Not listed on Binance': 'Не е листана на Binance', 'Not trading on Binance': 'Не се тргува на Binance',
  'Binance Monitoring tag': 'Ознака Monitoring на Binance',
  /* RECORD: the Telegram picks of April to August, graded strictly (2026-10-01) */
  '📬 Telegram picks — graded strictly': '📬 Изборите на Telegram — строго оценети',
  'Saved daily at the time': 'Зачувани секој ден во моментот',
    'See every pick, the best 20 and the worst 20 ↓': 'Видете го секој избор, најдобрите 20 и најлошите 20 ↓',
  '📬 Telegram picks, 28 Apr – 31 Aug 2026': '📬 Изборите на Telegram, 28 апр. – 31 авг. 2026',
  'The picks the bot saved each day, graded on the close 7 and 30 days later against the median coin. The best 20 and the worst 20 rotate-in picks are shown together, one per coin, then every pick. Coins with no Binance history cannot be graded and say so.':
    'Изборите што ботот ги зачувуваше секој ден, оценети според затворањето 7 и 30 дена подоцна наспроти просечната монета. Најдобрите 20 и најлошите 20 избори за влез се прикажани заедно, по еден за монета, а потоа секој избор. Монетите без историја на Binance не можат да се оценат и тоа е наведено.',
  'BEST 20 ROTATE-IN PICKS, 30 DAYS': 'НАЈДОБРИ 20 ИЗБОРИ ЗА ВЛЕЗ, 30 ДЕНА',
  'WORST 20 ROTATE-IN PICKS, 30 DAYS': 'НАЈЛОШИ 20 ИЗБОРИ ЗА ВЛЕЗ, 30 ДЕНА',
  'Rotate in and out': 'Влез и излез', 'Rotate in': 'Влез', 'Rotate out': 'Излез',
  'rotate in': 'влез', 'rotate out': 'излез',
  'DAY': 'ДЕН', 'COIN': 'МОНЕТА', 'SIDE': 'СТРАНА', 'PRICE THEN': 'ЦЕНА ТОГАШ',
  'VS MEDIAN, 7D': 'НАСПРОТИ ПРОСЕЧНАТА, 7Д', 'VS MEDIAN, 30D': 'НАСПРОТИ ПРОСЕЧНАТА, 30Д',
  'no data': 'нема податоци', 'Show more': 'Прикажи повеќе',
  '30 days': '30 дена', 'SINCE THE PICK': 'ОД ИЗБОРОТ', 'VS MEDIAN': 'НАСПРОТИ ПРОСЕЧНАТА',
  'Every day the bot saved its 5 rotate-in and 5 rotate-out picks with the price of the day. Here each one is graded on the close 30 days later against the median coin, where chance is 50%. Stricter than the 76.2% beside it, and it depends on the month: June, bought near the bottom, carries most of it. The bot picked from the biggest coins, which did better than small ones in these months, so the comparison with the 100 largest is the fairer one.':
    'Секој ден ботот ги зачувуваше своите 5 избори за влез и 5 за излез, со цената од тој ден. Тука секој е оценет според затворањето 30 дена подоцна наспроти просечната монета, каде случајноста е 50%. Построго од 76,2% до него, и зависи од месецот: јуни, купено близу дното, носи најголем дел. Ботот избираше од најголемите монети, кои во овие месеци поминаа подобро од малите, па споредбата со 100-те најголеми е пофер.',
  'The saved picks could not be loaded right now.': 'Зачуваните избори моментално не можат да се вчитаат.',
  /* RECORD: Telegram channel posts (HANDOVER.md Task 2, 2026-10-01) */
  '📊 Channel posts: market changes': '📊 Објави на каналот: промени на пазарот',
  'Since 2 Oct 2026 the Telegram channel posts only when the market changed and the change held. Each post is graded after 7 and 30 days on whether the move it described held. Chance is about 50%.':
    'Од 2 окт. 2026 каналот на Telegram објавува само кога пазарот се променил и промената се задржала. Секоја објава се оценува по 7 и по 30 дена според тоа дали опишаното движење се задржало. Случајноста е околу 50%.',
  'DATE': 'ДАТУМ', 'WHAT HAPPENED': 'ШТО СЕ СЛУЧИ', '7 DAYS': '7 ДЕНА', '30 DAYS': '30 ДЕНА',
  'the move held': 'движењето се задржа', 'the move did not hold': 'движењето не се задржа', 'not graded yet': 'сè уште не е оценето',
  'No market change has crossed a threshold since 2 Oct 2026.': 'Од 2 окт. 2026 ниту една промена на пазарот не го премина прагот.',
  'The channel posts could not be loaded right now.': 'Објавите на каналот моментално не можат да се вчитаат.',
  'BTC moved above its 200-day average': 'BTC мина над својот 200-дневен просек',
  'BTC fell below its 200-day average': 'BTC падна под својот 200-дневен просек',
  'Breadth turned up': 'Ширината се сврти нагоре', 'Breadth turned down': 'Ширината се сврти надолу',
  /* The weekly coin list (HANDOVER.md Task 1, 2026-10-01) */
  'No longer in the top 250.': 'Повеќе не е меѓу првите 250.',
  'None of your coins is in the top 250 now, so there is no signal.': 'Ниту една од вашите монети сега не е меѓу првите 250, па нема сигнал.',
  'Rotator no longer scores this coin. Its price is still shown.': 'Rotator повеќе не ја оценува оваа монета. Нејзината цена сè уште се прикажува.',
  'MEME': 'МИМ',
  'One of three high-volume memes outside the top 250. Listed, never shown as a leader.':
    'Една од трите мим-монети со голем обем надвор од првите 250. На листата е, но никогаш не се прикажува како водечка.',
  "Check Binance's announcement for dates and what happens to balances.": 'Проверете ја објавата на Binance за датумите и што ќе се случи со салдата.',
  'Binance reviews tagged coins for possible delisting.': 'Binance ги разгледува означените монети за можно отстранување од листата.',
  'New supply reaching the market can weigh on price.': 'Новата понуда што стига на пазарот може да ја притисне цената.',
  'You hold this': 'Ја држите',
  'Portfolio Signal': 'Сигнал на портфолиото',
  'Add holdings to see signal.': 'Додадете позиции за да го видите сигналот.',
  'Add holdings to see your signal.': 'Додадете позиции за да го видите вашиот сигнал.',
  'Holdings & Watchlist': 'Позиции и листа за следење',
  'MY COINS': 'МОИ МОНЕТИ', 'Add Coin': 'Додај монета',
  'LAGGING — WATCH': 'ЗАОСТАНУВА — СЛЕДЕТЕ', 'Click for full breakdown': 'Кликнете за целосна анализа',
  'On your watchlist': 'На вашата листа за следење', 'watching': 'следите', 'Watching': 'Следите', 'In holdings': 'Во позициите',
  'Add to watchlist': 'Додај во листата за следење',
  'Score gaps': 'Разлики во резултатот',
  'Scanning — no rotation setups in range right now.': 'Пребарување — во моментов нема поставки за ротација во опсегот.',
  'DYOR:': 'Истражете сами:',
  'A coin performing badly for months will not automatically recover because you bought it. Research before rotating capital.':
    'Монета што месеци наназад има лош учинок нема автоматски да се опорави затоа што сте ја купиле. Истражете пред да префрлате капитал.',
  'Rotator is not responsible for your investment decisions.': 'Rotator не е одговорен за вашите инвестициски одлуки.',
  'Information, not calls': 'Информација, не повик',
  'Edit Holdings': 'Уреди ги позициите', 'Buy Price ($)': 'Набавна цена ($)', 'Buy price': 'Набавна цена',
  'Quantity': 'Количина', 'SAVE': 'ЗАЧУВАЈ', '✓ SAVED': '✓ ЗАЧУВАНО',
});

/* ── COINS: leaderboard ─────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'PERFORMANCE LEADERBOARD': 'ТАБЕЛА НА УЧИНОКОТ', 'CLICK COLUMN HEADERS TO SORT': 'КЛИКНЕТЕ НА НАСЛОВИТЕ ЗА ПОДРЕДУВАЊЕ',
  'updated just now': 'ажурирано токму сега',
  'Open interest, USD — size of outstanding futures positions.': 'Отворен интерес, USD — големина на отворените фјучерс позиции.',
  'Funding rate. Positive = longs paying shorts.': 'Стапка на фандинг. Позитивна = лонг позициите им плаќаат на шорт.',
  'Unlock Rotator Score with Pro': 'Отклучете го резултатот на Rotator со Pro',
  'Search coin…': 'Пребарај монета…', 'ALL': 'СИТЕ', 'STABLE': 'СТЕЈБЛ', 'STOCKS': 'АКЦИИ', 'GAMING': 'ИГРИ',
  'Open interest change over 24h, %. Rising OI with rising price = new money; rising OI with falling price = new shorts.':
    'Промена на отворениот интерес за 24ч, %. OI расте со цена што расте = нови пари; OI расте со цена што паѓа = нови шорт позиции.',
  'Global long/short account ratio. Above 1 = more accounts long. Crowding, not a forecast.':
    'Глобален однос на лонг/шорт сметки. Над 1 = повеќе сметки во лонг. Преполнетост, не прогноза.',
  'Wilder RSI(14) on daily candles. Computed server-side.': 'Wilder RSI(14) на дневни свеќи. Пресметано на серверот.',
  'Wilder RSI(14) on weekly closes. Computed server-side.': 'Wilder RSI(14) на неделни затворања. Пресметано на серверот.',
  'Score = 40% 7D rank + 35% 14D rank + 25% 30D rank. Adjusted for macro & tokenomics. bStocks: momentum-only partial score, no tokenomics applies.':
    'Резултат = 40% ранг 7D + 35% ранг 14D + 25% ранг 30D. Прилагоден за макро и токеномика. bStocks: делумен резултат само од моментум, без токеномика.',
  'Estimated DeFi lending/staking APR': 'Проценет годишен принос од DeFi позајмување/стејкинг',
});

/* ── SWAP ───────────────────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Swap Calculator': 'Калкулатор за замена', 'Swap Tool': 'Алатка за замена',
  'Reserved for Project Supporters': 'Резервирано за поддржувачите на проектот',
  'Support/resistance levels, ratio charts, and the swap calculator are unlocked with a one-time contribution. Help keep Rotator independent.':
    'Нивоата на поддршка/отпор, графиконите на односот и калкулаторот за замена се отклучуваат со еднократен придонес. Помогнете Rotator да остане независен.',
  'SUPPORT & UNLOCK': 'ПОДДРЖИ И ОТКЛУЧИ', 'Select pair to swap': 'Изберете пар за замена',
  'Save pair': 'Зачувај пар', 'Refresh prices': 'Освежи цени', 'Share swap as image': 'Сподели ја замената како слика',
  'Select FROM coin': 'Изберете монета ОД', 'Select TO coin': 'Изберете монета ВО', 'tap ▾': 'допрете ▾',
  'Amount to swap': 'Износ за замена', 'Swap FROM and TO': 'Замени ОД и ВО', 'You receive': 'Добивате',
  'to choose your own coins': 'за да изберете свои монети',
  'Override prices': 'Рачни цени', 'Override FROM ($)': 'Рачна цена ОД ($)', 'Override from price': 'Рачна цена ОД',
  'Override TO ($)': 'Рачна цена ВО ($)', 'Override to price': 'Рачна цена ВО',
  'Current exchange ratio': 'Тековен однос на размена', 'Period low': 'Најниско во периодот', 'Period peak': 'Највисоко во периодот',
  'Position in range': 'Позиција во опсегот', 'No saved pairs yet — pick a pair and save it with the star': 'Сè уште нема зачувани парови — изберете пар и зачувајте го со ѕвездата',
  'Ratio history': 'Историја на односот', 'Low:': 'Ниско:', 'Peak:': 'Врв:', 'Now:': 'Сега:',
  'of monthly server costs': 'од месечните трошоци за сервер',
  'Live data via CoinGecko · Not financial advice · Always verify before swapping': 'Податоци во живо преку CoinGecko · Не е финансиски совет · Секогаш проверете пред замена',
  'Select coin': 'Изберете монета', 'Select a coin': 'Изберете монета', 'ADVANCED': 'НАПРЕДНО',
});

/* ── Coin window ────────────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Turn signals': 'Знаци за свртување', 'Score': 'Резултат', 'What the score is made of': 'Од што е составен резултатот',
  'Details': 'Детали', 'Technical events': 'Технички настани', 'Derivatives': 'Деривати', 'Market data': 'Пазарни податоци',
  'Supply and unlocks': 'Понуда и отклучувања', 'Market cycle': 'Пазарен циклус', 'Liquidity': 'Ликвидност', 'Badges': 'Ознаки',
  'Insight Engine': 'Insight Engine', 'Momentum · RSI(14)': 'Моментум · RSI(14)',
  'Generate shareable card image': 'Направи слика за споделување', 'Snapshot & Share': 'Слика и споделување',
  'Tokenized stock': 'Токенизирана акција',
  'Turn signals are measured on crypto only. The score for a stock is partial (out of 70) and not comparable with crypto.':
    'Знаците за свртување се мерат само кај крипто. Резултатот за акција е делумен (од 70) и не е споредлив со крипто.',
  'Stablecoin': 'Стејблкоин',
  'Pegged to a currency, so it has no trend to turn. Its score is not a signal.': 'Врзана е за валута, па нема тренд што би се свртел. Нејзиниот резултат не е сигнал.',
  'Neither leading nor lagging, with more signs pointing up than down.': 'Ниту води ниту заостанува, а повеќе знаци покажуваат нагоре отколку надолу.',
  'Neither leading nor lagging, with more signs pointing to cooling.': 'Ниту води ниту заостанува, а повеќе знаци покажуваат смирување.',
  'Neither leading nor lagging, with signs pointing both ways.': 'Ниту води ниту заостанува, а знаците покажуваат на двете страни.',
  'Neither leading nor lagging, and no turn signs either way.': 'Ниту води ниту заостанува, и нема знаци за свртување ни на едната страна.',
  'It has beaten most of the market, and some readings suggest the move is tiring.': 'Ја надмина поголемиот дел од пазарот, а некои читања укажуваат дека движењето се заморува.',
  'It has beaten most of the market, and nothing yet suggests the move is tiring.': 'Ја надмина поголемиот дел од пазарот, и сè уште ништо не укажува дека движењето се заморува.',
  'It has trailed most of the market. Some readings suggest a turn up, others that it is still weakening.': 'Заостанува зад поголемиот дел од пазарот. Некои читања укажуваат на свртување нагоре, други дека сè уште слабее.',
  'It has trailed most of the market, and some readings suggest a turn up may be starting.': 'Заостанува зад поголемиот дел од пазарот, а некои читања укажуваат дека можеби почнува свртување нагоре.',
  'It has trailed most of the market and is still weakening, with nothing yet suggesting a turn.': 'Заостанува зад поголемиот дел од пазарот и сè уште слабее, без ништо што укажува на свртување.',
  'It has trailed most of the market, with nothing yet suggesting a turn.': 'Заостанува зад поголемиот дел од пазарот, без ништо што укажува на свртување.',
  'None of these signs has been tested yet. A reading, not a forecast.': 'Ниту еден од овие знаци сè уште не е тестиран. Читање, не прогноза.',
  'Signs it may keep going': 'Знаци дека може да продолжи', 'Cooling signs': 'Знаци на смирување',
  'Turn-up signs': 'Знаци за свртување нагоре', 'Weakening signs': 'Знаци на слабеење',
  'Signs pointing up': 'Знаци нагоре', 'Signs pointing down': 'Знаци надолу', 'Context': 'Контекст',
  'No turn signal on this coin right now.': 'Во моментов нема знак за свртување кај оваа монета.',
  'Not tested yet': 'Сè уште не е тестирано', 'Tested: no edge on its own': 'Тестирано: само по себе нема предност',
  'No unlock schedule': 'Нема распоред за отклучување', 'No unlock in 30D': 'Нема отклучување за 30D',
  'No published vesting schedule. That is not the same as no unlock due.': 'Нема објавен распоред за вестинг. Тоа не е исто што и да нема предвидено отклучување.',
  'Circulating supply as a share of max supply': 'Понудата во оптек како дел од максималната понуда',
  'Circulating supply as a share of total supply': 'Понудата во оптек како дел од вкупната понуда',
  'Daily RSI(14). 30 and below is called oversold, 70 and above overbought.': 'Дневен RSI(14). 30 и помалку се смета за препродадено, 70 и повеќе за прекупено.',
  '60-day average above the 125-day': '60-дневниот просек е над 125-дневниот', '60-day average below the 125-day': '60-дневниот просек е под 125-дневниот',
  'Relative strength': 'Релативна сила', 'Zone': 'Зона', 'Engine read': 'Читање на моторот',
  'bottom of the range': 'дното на опсегот', 'top of the range': 'врвот на опсегот', 'middle of the range': 'средината на опсегот',
  'up over 30 days with no pullback yet': 'нагоре за 30 дена, сè уште без повлекување',
  'jumped sharply in the last 24 hours': 'нагло скокна во последните 24 часа', 'large 24-hour gain': 'голем раст за 24 часа',
  'still falling, and not slowing': 'сè уште паѓа, и не забавува',
  'down, but RSI is not low enough to call it washed out': 'надолу е, но RSI не е доволно низок за да се каже дека е исцрпено',
  'has lagged, RSI is low, and the fall has slowed': 'заостанала, RSI е низок, а падот забави',
  'no RSI reading to confirm anything': 'нема RSI читање што би потврдило нешто',
  'MOMENTUM': 'МОМЕНТУМ', 'MACRO STRENGTH': 'МАКРО СИЛА', 'TOKENOMICS': 'ТОКЕНОМИКА',
  'Supply issuance schedule, deflationary mechanics, and unlock/vesting risk. Can be negative — bad tokenomics actively subtracts from the score, it is not just a neutral add-on.':
    'Распоред на издавање на понудата, дефлациски механизми и ризик од отклучување/вестинг. Може да биде негативно — лошата токеномика активно одзема од резултатот, не е само неутрален додаток.',
  'Rank vs every other tracked coin on 7D/14D/30D momentum, weighted 25/30/45%. Higher = stronger relative recent momentum.':
    'Ранг наспроти секоја друга следена монета по моментум за 7D/14D/30D, пондерирано 25/30/45%. Повисоко = посилен релативен неодамнешен моментум.',
  'Relative strength vs BTC, Gold, Silver, Oil, DXY and the broader alt market (Total3) over 7D. Higher = outperforming the macro backdrop, not just the crypto market.':
    'Релативна сила наспроти BTC, злато, сребро, нафта, DXY и пошироко алт-пазарот (Total3) за 7D. Повисоко = подобро од макро позадината, не само од крипто пазарот.',
  'This score measures 7–30 day price momentum, macro relative strength, and (for crypto) supply/unlock mechanics. It is':
    'Овој резултат го мери ценовниот моментум за 7–30 дена, макро релативната сила и (за крипто) механиката на понудата/отклучувањето. Тој',
  'NOT': 'НЕ Е',
  'a security audit, a long-term valuation, a usage/TVL metric, or sentiment analysis — none of those are measured here. A high score means "strong recent relative momentum with reasonable tokenomics", not "guaranteed future profit". DYOR beyond this tool before deploying capital.':
    'безбедносна ревизија, долгорочна проценка, метрика за користење/TVL или анализа на расположението — ништо од тоа не се мери тука. Висок резултат значи „силен неодамнешен релативен моментум со разумна токеномика“, а не „гарантиран иден профит“. Истражете и надвор од оваа алатка пред да вложите капитал.',
  'No tokenomics data applies to equities — see the bStock badge tooltip. This is a partial score (max 70), not directly comparable to a crypto composite.':
    'Податоци за токеномика не важат за акции — видете го објаснувањето на ознаката bStock. Ова е делумен резултат (макс. 70), не е директно споредлив со крипто резултатот.',
  'RSI · DAILY': 'RSI · ДНЕВЕН', 'RSI · WEEKLY': 'RSI · НЕДЕЛЕН', 'RSI · DAILY OVER TIME': 'RSI · ДНЕВЕН НИЗ ВРЕМЕТО',
  'elevated': 'покачен', 'neutral': 'неутрален', 'overbought': 'прекупено', 'oversold': 'препродадено', 'low': 'низок', 'high': 'висок',
  'Wilder RSI(14) on daily candles, computed server-side. Compares recent gains with recent losses on a 0-100 scale. It describes what price has already done.':
    'Wilder RSI(14) на дневни свеќи, пресметано на серверот. Ги споредува неодамнешните добивки со неодамнешните загуби на скала 0-100. Опишува што цената веќе направила.',
  'Wilder RSI(14) on weekly closes. Slower, so it moves less often than the daily reading.':
    'Wilder RSI(14) на неделни затворања. Побавен, па се менува поретко од дневното читање.',
  'Detected from completed daily candles at 00:45 UTC. These describe what price and positioning have already done.':
    'Откриено од завршени дневни свеќи во 00:45 UTC. Опишуваат што цената и позиционирањето веќе направиле.',
  'OPEN INTEREST': 'ОТВОРЕН ИНТЕРЕС', 'FUNDING': 'ФАНДИНГ', 'LONG/SHORT · DAILY': 'ЛОНГ/ШОРТ · ДНЕВНО',
  'Time until the next funding payment is charged. Calculated when this modal opened — it does not count down.':
    'Време до следното плаќање на фандинг. Пресметано кога се отвори прозорецот — не одбројува.',
  'When Binance listed this perpetual.': 'Кога Binance го листал овој перпетуал.',
  "Binance's own category tags for this coin. Seed marks projects Binance treats as higher volatility and risk.":
    'Сопствените ознаки за категорија на Binance за оваа монета. Seed ги означува проектите што Binance ги смета за поволатилни и поризични.',
  'Change in open interest over 24h. Rising means positions are being opened, falling means they are closing.':
    'Промена на отворениот интерес за 24ч. Раст значи дека се отвораат позиции, пад значи дека се затвораат.',
  'Change in open interest over the last hour. Read it against OI 24H: a 24h build with a 1h fall is a position that has started coming off.':
    'Промена на отворениот интерес во последниот час. Читајте ја наспроти OI 24H: раст за 24ч со пад за 1ч е позиција што почнала да се затвора.',
  'Price down and open interest down — positions are being flushed out rather than new bets placed. Derived from price direction versus open-interest direction over 24h. Descriptive only — it does not affect the score.':
    'Цената паѓа и отворениот интерес паѓа — позициите се чистат наместо да се отвораат нови облози. Изведено од насоката на цената наспроти насоката на отворениот интерес за 24ч. Само опис — не влијае на резултатот.',
  'Price up and open interest up — the move is backed by fresh positions rather than short covering. Derived from price direction versus open-interest direction over 24h. Descriptive only — it does not affect the score.':
    'Цената расте и отворениот интерес расте — движењето е поддржано од нови позиции, а не од затворање шорт позиции. Изведено од насоката на цената наспроти насоката на отворениот интерес за 24ч. Само опис — не влијае на резултатот.',
  'Price up and open interest down — shorts are closing rather than new buyers arriving. Derived from price direction versus open-interest direction over 24h. Descriptive only — it does not affect the score.':
    'Цената расте, а отворениот интерес паѓа — се затвораат шорт позиции наместо да доаѓаат нови купувачи. Изведено од насоката на цената наспроти насоката на отворениот интерес за 24ч. Само опис — не влијае на резултатот.',
  'Price down and open interest up — new short positions are building. Derived from price direction versus open-interest direction over 24h. Descriptive only — it does not affect the score.':
    'Цената паѓа, а отворениот интерес расте — се градат нови шорт позиции. Изведено од насоката на цената наспроти насоката на отворениот интерес за 24ч. Само опис — не влијае на резултатот.',
  '% UNLOCKED': '% ОТКЛУЧЕНО', '% UNLOCKED (of max)': '% ОТКЛУЧЕНО (од макс.)', '% UNLOCKED (of total)': '% ОТКЛУЧЕНО (од вкупно)',
  'CIRCULATING': 'ВО ОПТЕК', 'MAX SUPPLY': 'МАКС. ПОНУДА', 'FROM ATH': 'ОД ВРВОТ (ATH)', '∞ / No max': '∞ / Без максимум',
  'UNLOCKS · 30D': 'ОТКЛУЧУВАЊА · 30D', 'PENDING': 'ПРЕДСТОИ', 'no schedule': 'нема распоред',
  'No published vesting schedule for this coin. That is not the same as no unlock due — about 70% of the universe has no schedule available.':
    'Нема објавен распоред за вестинг за оваа монета. Тоа не е исто што и да нема предвидено отклучување — за околу 70% од монетите нема достапен распоред.',
  'Share of the supply unlocked so far that vests again over the next 30 days.': 'Дел од досега отклучената понуда што повторно се ослободува во следните 30 дена.',
  'MAYER MULTIPLE': 'MAYER MULTIPLE', '24H VOL / MCAP': '24H ОБЕМ / КАП.',
  'THIN ⚠': 'ТЕНКА ⚠', 'HEALTHY': 'ЗДРАВА', 'MODERATE': 'УМЕРЕНА',
  'Low turnover relative to market cap — exiting even a modest position may be difficult without moving the price against yourself. Heuristic thresholds (8%+ / 2-8% / under 2%), not a precise scientific boundary. The order book is where the real depth shows.':
    'Мал промет во однос на пазарната капитализација — излегувањето дури и од скромна позиција може да биде тешко без да ја поместите цената против себе. Хеуристички прагови (8%+ / 2-8% / под 2%), не прецизна научна граница. Вистинската длабочина се гледа во книгата на налози.',
  'Plenty of daily turnover relative to size — exiting a normal position should not move the price much. Heuristic thresholds (8%+ / 2-8% / under 2%), not a precise scientific boundary. The order book is where the real depth shows.':
    'Доволно дневен промет во однос на големината — излегувањето од нормална позиција не би требало многу да ја помести цената. Хеуристички прагови (8%+ / 2-8% / под 2%), не прецизна научна граница. Вистинската длабочина се гледа во книгата на налози.',
  'Workable liquidity, but a large order could move the price. Heuristic thresholds (8%+ / 2-8% / under 2%), not a precise scientific boundary. The order book is where the real depth shows.':
    'Применлива ликвидност, но голем налог може да ја помести цената. Хеуристички прагови (8%+ / 2-8% / под 2%), не прецизна научна граница. Вистинската длабочина се гледа во книгата на налози.',
  "The listed company's market capitalisation (share price × shares outstanding), as published by Binance. Not the size of the tokenized market on Binance, and not used in scoring.":
    'Пазарната капитализација на листаната компанија (цена на акцијата × акции во оптек), како што ја објавува Binance. Не е големината на токенизираниот пазар на Binance и не се користи во оценувањето.',
  'n/a (stock)': 'н/п (акција)', 'NEUTRAL': 'НЕУТРАЛНО', 'HIGH BETA': 'ЗАСИЛЕНИ ДВИЖЕЊА', 'RAN AHEAD': 'ИСТРЧАНА НАПРЕД',
  'MOMENTUM ': 'МОМЕНТУМ', '24H SURGE': 'СКОК 24H', '24H DIP': 'ПАД 24H', '7D BREAKOUT': 'ПРОБИВ 7D', '7D BREAKDOWN': 'ПРОБИВ НАДОЛУ 7D',
  '30D UPTREND': 'ТРЕНД НАГОРЕ 30D', '30D DOWNTREND': 'ТРЕНД НАДОЛУ 30D', 'TOP OF RANGE': 'ВРВ НА ОПСЕГОТ',
  'BINANCE DELISTING ANNOUNCED': 'BINANCE НАЈАВИ ОТСТРАНУВАЊЕ ОД ЛИСТАТА',
  "Today's insight is already live for Pro users.": 'Денешниот увид е веќе достапен за Pro корисниците.',
  "UNLOCK TODAY'S SIGNAL": 'ОТКЛУЧИ ГО ДЕНЕШНИОТ СИГНАЛ', 'Unlock all signals with Pro': 'Отклучете ги сите сигнали со Pro',
  'Insight Engine is a Pro feature': 'Insight Engine е Pro функција', 'UNLOCK PRO': 'ОТКЛУЧИ PRO',
  '24H DELAYED': 'ДОЦНИ 24Ч',
});

/* ── Insight Engine readings (engine.js wording, translated for display) ── */
Object.assign(MK_TEXT, {
  'Momentum Building': 'Моментумот расте', 'Momentum Fading': 'Моментумот слабее',
  'High Volume + Stable Price (Accumulation)': 'Висок обем + стабилна цена (акумулација)',
  'High Liquidity Interest': 'Висок интерес за ликвидност', 'Moderate Volume Activity': 'Умерена активност на обемот',
  'Low Liquidity (Large Cap)': 'Ниска ликвидност (голема капитализација)', 'Below-Average Volume': 'Обем под просекот',
  'MACD Bullish Cross': 'MACD биковско пресекување', 'MACD Bearish Cross': 'MACD мечкино пресекување',
  'BB Wide — High Volatility': 'BB широки — висока волатилност', 'Volume Drying Up': 'Обемот пресушува',
  'Binance 4H data': 'Binance 4H податоци',
  'FEAR & GREED INDEX ': 'ИНДЕКС НА СТРАВ И АЛЧНОСТ',
});

/* ── Modals: welcome, disclaimer, about, add holding, share ─────── */
Object.assign(MK_TEXT, {
  'Welcome to Rotator!': 'Добредојдовте во Rotator!',
  'By continuing to use this application, you acknowledge that this is an': 'Со продолжување на користењето на апликацијата потврдувате дека ова е',
  'informational tool only': 'само информативна алатка',
  'and not financial advice. You accept our': 'и не е финансиски совет. Ги прифаќате нашите',
  'Terms of Service': 'Услови за користење', 'and': 'и', 'Privacy Policy': 'Политика за приватност',
  'I Understand & Accept': 'Разбирам и прифаќам',
  'NOT FINANCIAL ADVICE': 'НЕ Е ФИНАНСИСКИ СОВЕТ',
  'Rotator is an informational tool only. Scores and signals are based on historical price data and do not predict future performance. Nothing on this platform constitutes financial, investment, or trading advice. Always do your own research and consult a qualified financial advisor before making any investment decisions.':
    'Rotator е само информативна алатка. Резултатите и сигналите се засноваат на историски ценовни податоци и не ја предвидуваат идната успешност. Ништо на оваа платформа не претставува финансиски, инвестициски или трговски совет. Секогаш истражувајте сами и консултирајте квалификуван финансиски советник пред да донесете инвестициска одлука.',
  'I understand that Rotator is': 'Разбирам дека Rotator', 'not financial advice': 'не е финансиски совет',
  'and I am solely responsible for my own investment decisions.': 'и дека единствено јас сум одговорен за своите инвестициски одлуки.',
  'Turn off': 'Исклучи', '← Back': '← Назад',
  'About Rotator ': 'За Rotator',
  'A free, real-time relative-strength research tool for the crypto market.': 'Бесплатна алатка за истражување на релативната сила на крипто пазарот во реално време.',
  'was built with one goal: show, from data,': 'е изграден со една цел: да покаже, врз основа на податоци,',
  'what is performing relatively strongly and what is performing relatively weakly': 'што има релативно силен, а што релативно слаб учинок',
  'across the crypto market — and what changed.': 'на крипто пазарот — и што се сменило.',
  'Rotator scores every coin across 7, 14, and 30-day timeframes, then shows which coins in your portfolio have':
    'Rotator ја оценува секоја монета во периоди од 7, 14 и 30 дена, а потоа покажува кои монети во вашето портфолио',
  'outperformed': 'го надминаа', 'the rest of the tracked market and which have': 'остатокот од следениот пазар, а кои',
  'underperformed': 'заостанаа зад', 'it. It reports the evidence and the evidence against — what you do with it is your decision.':
    'него. Ги прикажува доказите и доказите против — што ќе направите со тоа е ваша одлука.',
  'The tool is': 'Алатката е', '100% free, no account required': '100% бесплатна, без сметка',
  ', and runs in your browser. Your holdings stay there: quantities and buy prices never reach our server. The Privacy Policy lists the little that does.':
    ', и работи во вашиот прелистувач. Вашите позиции остануваат таму: количините и набавните цени никогаш не стигнуваат до нашиот сервер. Политиката за приватност го наведува малкуто што стигнува.',
  'Coming soon:': 'Наскоро:',
  'Forex pairs, stock portfolio tracking, and a unified multi-asset dashboard so you can track all your investments in one place.':
    'Форекс парови, следење на портфолио со акции и обединета табла за повеќе средства, за да ги следите сите ваши инвестиции на едно место.',
  'Rotator is an informational tool only. Nothing here constitutes financial advice. Always do your own research.':
    'Rotator е само информативна алатка. Ништо тука не претставува финансиски совет. Секогаш истражувајте сами.',
  'Business inquiries, Pro support, or feedback:': 'Деловни прашања, поддршка за Pro или повратни информации:',
  'Add to Holdings': 'Додај во позициите', 'Add to holdings': 'Додај во позициите',
  'Search for a coin, enter your quantity and average buy price.': 'Пребарајте монета, внесете ја количината и просечната набавна цена.',
  'Search and select a coin, then enter quantity and average buy price.': 'Пребарајте и изберете монета, а потоа внесете количина и просечна набавна цена.',
  'Search coin name or symbol…': 'Пребарајте име или симбол на монета…',
  'Avg Buy Price ($)': 'Просечна набавна цена ($)', 'Avg buy price ($)': 'Просечна набавна цена ($)',
  'amount': 'количина', 'Amount': 'Количина', 'avg buy price': 'просечна набавна цена', 'Average buy price': 'Просечна набавна цена',
  'Close tutorial': 'Затвори ја турата',
  'Share This Signal': 'Сподели го овој сигнал',
  'Spread the word — your referral link is embedded automatically.': 'Раширете го гласот — вашиот линк за препорака е вметнат автоматски.',
  'SHARE MESSAGE': 'ПОРАКА ЗА СПОДЕЛУВАЊЕ', 'Try another message': 'Пробајте друга порака', 'Different message': 'Друга порака',
  'Share on X': 'Сподели на X', 'Share on Telegram': 'Сподели на Telegram', 'Share on WhatsApp': 'Сподели на WhatsApp',
  'Share on Discord': 'Сподели на Discord', 'Share on Messenger': 'Сподели на Messenger', 'Share on Reddit': 'Сподели на Reddit',
  'Share on Threads': 'Сподели на Threads', 'Copy message': 'Копирај порака', 'Share with Image': 'Сподели со слика', 'Download Only': 'Само преземи',
  'Post': 'Објави',
});

/* ── Settings panel ─────────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Customize your Rotator experience.': 'Прилагодете го Rotator по ваш вкус.',
  'Language': 'Јазик', 'Choose your preferred language': 'Изберете го посакуваниот јазик',
  'Light Theme': 'Светла тема', 'Switch between dark and light mode': 'Префрлете меѓу темен и светол режим',
  'Show Tutorial': 'Прикажи тура', 'Step-by-step guide for first-time users': 'Водич чекор по чекор за нови корисници',
  'Replay Tutorial Now': 'Повтори ја турата сега', 'Walk through the guide again': 'Поминете го водичот уште еднаш',
  'START →': 'ПОЧНИ →', 'Pro Features Tutorial': 'Тура за Pro функциите',
  'Learn about Insight Engine, swap levels & more': 'Дознајте за Insight Engine, нивоата за замена и повеќе',
  'Swap Tool Tutorial': 'Тура за алатката за замена', 'Learn how to use the ratio swap calculator': 'Научете како да го користите калкулаторот за замена',
  'Add Rotator to your home screen for instant access': 'Додајте го Rotator на почетниот екран за брз пристап',
});

/* ── Donate, tip, Pro ───────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Roadmap:': 'План:', 'API access · Watchlists · Multi-portfolio tracking': 'API пристап · Листи за следење · Следење на повеќе портфолија',
  'Payment Methods': 'Начини на плаќање', 'Crypto Donation': 'Крипто донација', 'COPY BINANCE ID': 'КОПИРАЈ BINANCE ID',
  'Need help?': 'Ви треба помош?', 'Already sent payment? Verify & activate Pro instantly': 'Веќе плативте? Проверете и активирајте Pro веднаш',
  'Pro activates instantly': 'Pro се активира веднаш', 'Network...': 'Мрежа...', 'Binance Pay (manual review)': 'Binance Pay (рачна проверка)',
  'TX hash (from your wallet or block explorer)': 'TX хеш (од вашиот паричник или блок-истражувач)',
  'Contact (optional — Telegram/Discord/Email)': 'Контакт (незадолжително — Telegram/Discord/е-пошта)',
  'VERIFY TX & ACTIVATE PRO': 'ПРОВЕРИ TX И АКТИВИРАЈ PRO',
  'Community & Notifications': 'Заедница и известувања', 'Join the community channels for market pulse updates and discussion.': 'Приклучете се на каналите на заедницата за новости за пазарниот пулс и дискусија.',
  'Telegram market pulse notifications are Pro-only.': 'Известувањата за пазарниот пулс на Telegram се само за Pro.', 'Market pulse notifications': 'Известувања за пазарниот пулс', 'Coming soon': 'Наскоро',
  'Thank You!': 'Ви благодариме!',
  'Your donation ensures the future development of this tool and better quality of its products — faster API calls, more accurate live data, and new features.':
    'Вашата донација го обезбедува идниот развој на оваа алатка и подобар квалитет на нејзините производи — побрзи API повици, попрецизни податоци во живо и нови функции.',
  'These improvements require a paid CoinGecko API. For now we go steady — your support gets us there.':
    'Овие подобрувања бараат платен CoinGecko API. Засега одиме полека — вашата поддршка нè носи таму.',
  'CLOSE': 'ЗАТВОРИ',
  'Support the Project & Unlock Pro': 'Поддржете го проектот и отклучете Pro',
  'No subscriptions.': 'Без претплати.', 'One-time contribution': 'Еднократен придонес', 'unlocks the full features.': 'ги отклучува сите функции.',
  '⚡ Pro — free, or with a contribution': '⚡ Pro — бесплатно или со придонес',
  'Three ways to unlock the full features, all equal:': 'Три начини да ги отклучите сите функции, сите еднакви:',
  'invite 5 friends': 'поканете 5 пријатели', '(free),': '(бесплатно),', 'redeem a Pro code': 'внесете Pro код',
  '(free), or a': '(бесплатно), или', 'one-time contribution': 'еднократен придонес', '. No subscriptions.': '. Без претплати.',
  'to choose your own coins (free with 5 invites)': 'за да ги изберете вашите монети (бесплатно со 5 покани)',
  'Insight Engine is a Pro feature, free with 5 invites or a code': 'Insight Engine е Pro функција, бесплатно со 5 покани или код',
  'Unlock Pro, free with 5 invites': 'Отклучете Pro, бесплатно со 5 покани',
  'Unlock all signals with Pro, free with 5 invites': 'Отклучете ги сите сигнали со Pro, бесплатно со 5 покани',
  'The Telegram channel posts the daily market pulse, free for everyone.': 'Telegram каналот го објавува дневниот пазарен пулс, бесплатно за сите.',
  'Pro adds personal Telegram alerts about your own coins.': 'Pro додава лични Telegram известувања за вашите монети.',
  'Free market pulse': 'Бесплатен пазарен пулс', 'The market pulse channel on Telegram is': 'Каналот за пазарен пулс на Telegram е',
  'free for everyone': 'бесплатен за сите', '. Pro adds personal alerts about your own coins. Discord coming soon.': '. Pro додава лични известувања за вашите монети. Discord наскоро.',
  'Telegram market pulse channel': 'Telegram канал за пазарен пулс', '+ personal Telegram alerts': '+ лични Telegram известувања',
  'Pro is optional.': 'Pro е незадолжителен.', 'Rotator is free': 'Rotator е бесплатен', 'and runs on donations and the honor system.': 'и се одржува со донации и на доверба.',
  'A one-time contribution unlocks the full features — no subscriptions.': 'Еднократен придонес ги отклучува сите функции — без претплати.',
  'FREE': 'БЕСПЛАТНО',
  '2 holdings': '2 позиции', '10 holdings': '10 позиции', 'Default swap pair': 'Стандарден пар за замена', 'Any swap pair': 'Кој било пар за замена',
  'Insight Engine, 24h delayed': 'Insight Engine, доцни 24ч', 'Insight Engine, live': 'Insight Engine, во живо',
  '1 strongest, 2 weakest tiles': '1 најсилна, 2 најслаби плочки', 'All 6 of each': 'Сите 6 од секоја',
  'First 2 coin badges': 'Првите 2 ознаки на монетата', 'Every coin badge': 'Сите ознаки на монетата', 'Telegram market pulse notifications': 'Известувања за пазарниот пулс на Telegram',
  'Turn signs: top 2 of each list': 'Знаци за свртување: првите 2 од секоја листа', 'Every coin with a turn sign': 'Секоја монета со знак за свртување',
  'Exchange and unlock alerts': 'Известувања од берзата и за отклучувања', '+ turn signs, ETF, Telegram DMs': '+ знаци за свртување, ETF, пораки на Telegram',
  'PAY WITH CRYPTO — AUTO-VERIFIED, INSTANT PRO': 'ПЛАТЕТЕ СО КРИПТО — АВТОМАТСКА ПРОВЕРКА, PRO ВЕДНАШ',
  'Send': 'Испратете', '(or equivalent BNB/ETH) to any wallet below. Submit your TX hash and': '(или еквивалент во BNB/ETH) на кој било паричник подолу. Внесете го TX хешот и',
  '— fully automated, no waiting.': '— целосно автоматски, без чекање.',
  'View full donation page with copy buttons →': 'Погледнете ја целата страница за донации со копчиња за копирање →',
  'COMMUNITY & NOTIFICATIONS': 'ЗАЕДНИЦА И ИЗВЕСТУВАЊА', 'Pro members get': 'Pro членовите добиваат',
  'market pulse notifications on Telegram': 'известувања за пазарниот пулс на Telegram', '. Discord coming soon.': '. Discord наскоро.',
  'HAVE A PRO CODE?': 'ИМАТЕ PRO КОД?', 'Enter your Pro code': 'Внесете го вашиот Pro код',
  'ALREADY HAVE PRO ON ANOTHER DEVICE?': 'ВЕЌЕ ИМАТЕ PRO НА ДРУГ УРЕД?', 'Enter your recovery key': 'Внесете го клучот за враќање',
  'REDEEM': 'ИСКОРИСТИ', 'RESTORE': 'ВРАТИ',
  'Thank You, Supporter!': 'Ви благодариме, поддржувачу!', 'Pro is active — full features unlocked': 'Pro е активен — сите функции се отклучени',
  'Full features — your support keeps Rotator independent': 'Сите функции — вашата поддршка го одржува Rotator независен',
  'Keeping Rotator free and ad-free': 'Rotator да остане бесплатен и без реклами',
  'YOUR RECOVERY KEY': 'ВАШИОТ КЛУЧ ЗА ВРАЌАЊЕ', 'Save this key to restore Pro on another device or browser:': 'Зачувајте го овој клуч за да го вратите Pro на друг уред или прелистувач:',
  'COPY': 'КОПИРАЈ', 'SHARE ROTATOR WITH FRIENDS': 'СПОДЕЛЕТЕ ГО ROTATOR СО ПРИЈАТЕЛИ',
  'Rotator stays independent because supporters like you spread the word. Share the love:': 'Rotator останува независен затоа што поддржувачи како вас го шират гласот. Споделете ја љубовта:',
  'COPY REFERRAL LINK': 'КОПИРАЈ ЛИНК ЗА ПРЕПОРАКА', 'COPY ADDRESS': 'КОПИРАЈ АДРЕСА', '✓ COPIED!': '✓ КОПИРАНО!',
  'Share your link. When 5 more friends open Rotator through it, the full features unlock.': 'Споделете го вашиот линк. Кога уште 5 пријатели ќе го отворат Rotator преку него, се отклучуваат сите функции.',
  'INVITE 5 FRIENDS → UNLOCK PRO FREE': 'ПОКАНЕТЕ 5 ПРИЈАТЕЛИ → ОТКЛУЧЕТЕ PRO БЕСПЛАТНО',
  'Ask about the current scores. Answers come only from the latest run, never invented.': 'Прашајте за тековните резултати. Одговорите доаѓаат само од последното пресметување, никогаш измислени.',
  'e.g. what looks weak right now?': 'пр. што изгледа слабо во моментов?',
  'Algorithmic rotation signal only · Not financial advice · DYOR': 'Само алгоритамски сигнал за ротација · Не е финансиски совет · Истражете сами',
});

/* ── Footer, loading, misc ──────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'Your Daily Asset Performance Tracker': 'Ваш дневен следач на учинокот на средствата',
  'All done! This free tool is built by one person — thanks for your patience ♥': 'Готово! Оваа бесплатна алатка ја изработува еден човек — ви благодариме за трпението ♥',
  '"Time in the market beats timing the market."': '„Времето на пазарот го победува тајмингот на пазарот.“',
  'Price data provided by': 'Ценовните податоци ги обезбедува', 'Powered by': 'Овозможено од', 'On-chain by': 'On-chain податоци од',
  'Data powered by': 'Податоци од',
  'Market data also sourced from GeckoTerminal, Farside Investors, alternative.me, DefiLlama and Yahoo Finance. All data is for informational purposes only. Past performance does not guarantee future results. Always conduct your own research before making any investment decision.':
    'Пазарните податоци доаѓаат и од GeckoTerminal, Farside Investors, alternative.me, DefiLlama и Yahoo Finance. Сите податоци се само за информативни цели. Минатиот учинок не гарантира идни резултати. Секогаш истражувајте сами пред инвестициска одлука.',
  'details ›': 'детали ›',
  'Scoring and ranking coins…': 'Се оценуваат и рангираат монетите…', 'Fetching bStock data…': 'Се вчитуваат податоците за bStocks…',
  'Loading macro data — Gold, Oil…': 'Се вчитуваат макро податоците — злато, нафта…', 'Fetching sentiment data…': 'Се вчитуваат податоците за расположението…',
  'Almost ready — building your dashboard…': 'Речиси готово — се гради вашата табла…',
});

/* ── Coin window: labels the first pass missed (2026-10-02) ─────────
   Translated by meaning, for a viewer who does not trade derivatives.
   HIGH BETA is a low score that exaggerates the market's moves, so it is
   "засилени движења", not "висока бета". Binance's tag names (Seed,
   Launchpool, Layer1 / Layer2, Monitoring) and Mayer Multiple stay as
   Binance and the indicator call them. */
Object.assign(MK_TEXT, {
  'CRYPTO': 'КРИПТО', 'STOCK': 'АКЦИЈА',
  'BULLISH': 'СИЛНО', 'BEARISH': 'СЛАБО',
  '7D RANK': 'РАНГ 7D', '14D RANK': 'РАНГ 14D', '30D RANK': 'РАНГ 30D', 'COMPOSITE': 'ВКУПНО',
  'ALREADY HELD': 'ВЕЌЕ ГО ДРЖИТЕ',
  'ASSESSMENT': 'ПРОЦЕНКА', 'MKT CAP': 'ПАЗАРНА ВРЕДНОСТ', '24H VOL': 'ОБЕМ 24H',
  '200D AVG': 'ПРОСЕК 200 ДЕНА', 'CYCLE STATE': 'ФАЗА НА ЦИКЛУСОТ',
  'MC RANK': 'РАНГ ПО ВРЕДНОСТ', 'BINANCE TAGS': 'ОЗНАКИ НА BINANCE',
  'BINANCE MONITORING': 'ОЗНАКА MONITORING НА BINANCE',
  'POSITIONING': 'ПОЗИЦИОНИРАЊЕ', 'NEW MONEY': 'НОВИ ПАРИ', 'SHORT COVERING': 'ЗАТВОРАЊЕ ШОРТОВИ',
  'NEW SHORTS': 'НОВИ ШОРТОВИ', 'UNWINDING': 'ЗАТВОРАЊЕ ПОЗИЦИИ',
  'TAKER FLOW': 'КУПУВАЊЕ / ПРОДАЖБА', 'BASIS': 'РАЗЛИКА ОД СПОТ',
  'NEXT FUNDING': 'СЛЕДЕН ФАНДИНГ', 'PERP AGE': 'СТАРОСТ НА ПЕРПЕТУАЛОТ',
  'Loading history…': 'Се вчитува историјата…',
  'Detected from completed daily candles at 00:45 UTC. These describe what price and positioning have already done.':
    'Пронајдено од затворените дневни свеќи во 00:45 UTC. Ова опишува што цената и позициите веќе направиле.',
  'Detected from completed daily candles at 00:45 UTC. Moving averages are 60-day and 125-day, not the classic 50/200. These describe what price and positioning have already done.':
    'Пронајдено од затворените дневни свеќи во 00:45 UTC. Подвижните просеци се 60-дневен и 125-дневен, не класичните 50/200. Ова опишува што цената и позициите веќе направиле.',
});

/* ══ TEMPLATES WITH NUMBERS ══════════════════════════════════════════ */
(function () {
  var P = function (re, fn) { MK_PATTERNS.push([re, fn]); };
  var n = '([−\\-+]?[\\d.,]+)';
  var plur = function (k, one, many) { return Number(k) === 1 ? one : many; };
  P(/^(\d+) days? of history recorded so far — the trend line appears at (\d+)\. One reading is added per day\.$/, function (m) { return m[1] + ' ' + plur(m[1], 'ден', 'дена') + ' историја досега — линијата на трендот се појавува на ' + m[2] + '. Секој ден се додава по едно читање.'; });
  var RSI_ZONE = { 'Oversold': 'Препродадено', 'Low Momentum': 'Слаб моментум', 'Cooling': 'Се лади', 'Overbought': 'Прекупено', 'Hot Zone': 'Жешка зона', 'Warming': 'Се загрева' };

  /* Coin window: the reading */
  P(/^Has run ahead · (\d+) cooling signs?$/, function (m) { return 'Истрчала напред · ' + m[1] + ' ' + plur(m[1], 'знак на смирување', 'знаци на смирување'); });
  P(/^Has run ahead · no cooling signs yet$/, function () { return 'Истрчала напред · сè уште без знаци на смирување'; });
  P(/^Has lagged · (\d+) turn-up signs?$/, function (m) { return 'Заостанала · ' + m[1] + ' ' + plur(m[1], 'знак за свртување нагоре', 'знаци за свртување нагоре'); });
  P(/^Has lagged · no turn-up signs yet$/, function () { return 'Заостанала · сè уште без знаци за свртување нагоре'; });
  P(/^Middle of the pack · (\d+) up, (\d+) down$/, function (m) { return 'Во средината · ' + m[1] + ' нагоре, ' + m[2] + ' надолу'; });
  P(/^Middle of the pack · no turn signs$/, function () { return 'Во средината · без знаци за свртување'; });

  /* Seed label on the signal tiles (promptove/82) */
  P(/^([A-Z0-9]+) is a Seed coin \(Binance: early-stage, higher risk\)\. Since (\d{4}), Seed coins after a run like this trailed the average coin over the next month (\d+) times in 10\.$/, function (m) { return m[1] + ' е Seed монета (според Binance: проект во рана фаза, поризичен). Од ' + m[2] + ', Seed монетите по ваков раст заостанаа зад просечната монета во следниот месец ' + m[3] + ' пати од 10.'; });
  P(/^([A-Z0-9]+) is a Seed coin \(Binance: early-stage, higher risk\)\. Since (\d{4}), Seed coins that had fallen behind kept trailing the average coin (\d+) times in 10\.$/, function (m) { return m[1] + ' е Seed монета (според Binance: проект во рана фаза, поризичен). Од ' + m[2] + ', Seed монетите што веќе заостанале продолжија да заостануваат зад просечната монета ' + m[3] + ' пати од 10.'; });
  P(/^None of these signs has passed its test yet\. The closest, the quick RSI bounce, beat the market ([\d.]+)% of the time against ([\d.]+)% for a random pick\.( Highlighted chips are the tested ones\.)? A reading, not a forecast\.$/,
    function (m) { return 'Ниту еден од овие знаци сè уште не го помина својот тест. Најблискиот, брзиот RSI отскок, го победи пазарот во ' + m[1] + '% од случаите наспроти ' + m[2] + '% за случаен избор.' + (m[3] ? ' Истакнатите ознаки се тестираните.' : '') + ' Читање, не прогноза.'; });
  /* Evidence chips */
  P(/^Tested: ([\d.]+)% beat the market over (\d+) days \((\d+) cases\) · weak, not proven$/, function (m) { return 'Тестирано: ' + m[1] + '% го победија пазарот за ' + m[2] + ' дена (' + m[3] + ' случаи) · слабо, не е докажано'; });
  P(/^Tested: ([\d.]+)% at (\d+) days, ([\d.]+)% at 30 \((\d+) cases\) · not proven$/, function (m) { return 'Тестирано: ' + m[1] + '% за ' + m[2] + ' дена, ' + m[3] + '% за 30 (' + m[4] + ' случаи) · не е докажано'; });
  P(/^Tested: not a warning · ([\d.]+)% beat the market over 30 days \((\d+) cases\)$/, function (m) { return 'Тестирано: не е предупредување · ' + m[1] + '% го победија пазарот за 30 дена (' + m[2] + ' случаи)'; });
  P(/^Tested: only (\d+) cases, too few to judge$/, function (m) { return 'Тестирано: само ' + m[1] + ' случаи, премалку за проценка'; });
  P(/^Tested: big outflow weeks were followed by a weaker BTC week \(([^)]+)% vs average, (\d+) trading days\) · weak, not proven$/, function (m) { return 'Тестирано: по неделите со големи одливи следуваше послаба недела за BTC (' + m[1] + '% наспроти просекот, ' + m[2] + ' дена на тргување) · слабо, не е докажано'; });
  /* Key facts chips */
  P(/^RSI (\d+) · (oversold|overbought)$/, function (m) { return 'RSI ' + m[1] + ' · ' + (m[2] === 'oversold' ? 'препродадено' : 'прекупено'); });
  P(/^Trend (up|down) \(60D ([<>]) 125D\)$/, function (m) { return 'Тренд ' + (m[1] === 'up' ? 'нагоре' : 'надолу') + ' (60D ' + m[2] + ' 125D)'; });
  P(/^Supply (\d+)% unlocked$/, function (m) { return 'Понуда ' + m[1] + '% отклучена'; });
  P(/^Unlock ([\d.]+)% in 30D( · [\d-]+)?$/, function (m) { return 'Отклучување ' + m[1] + '% за 30D' + (m[2] || ''); });
  P(/^60-day average (above|below) the 125-day, for (\d+) days?$/, function (m) { return '60-дневниот просек е ' + (m[1] === 'above' ? 'над' : 'под') + ' 125-дневниот, веќе ' + m[2] + ' ' + plur(m[2], 'ден', 'дена'); });
  P(/^Context · (\d+)$/, function (m) { return 'Контекст · ' + m[1]; });
  /* Sign details */
  P(/^(\d+) days? ago$/, function (m) { return 'пред ' + m[1] + ' ' + plur(m[1], 'ден', 'дена'); });
  P(/^RSI back above 30 after (\d+)(\+?) days? below$/, function (m) { return 'RSI повторно над 30 по ' + m[1] + m[2] + ' ' + plur(m[1], 'ден', 'дена') + ' под таа граница'; });
  P(/^RSI back above 30 only after (\d+)(\+?) days? below; slow bounces mostly trailed the market in earlier data$/, function (m) { return 'RSI повторно над 30 дури по ' + m[1] + m[2] + ' ' + plur(m[1], 'ден', 'дена') + ' под таа граница; бавните отскоци главно заостануваа зад пазарот во поранешните податоци'; });
  P(/^after (\d+)(\+?) days? below$/, function (m) { return 'по ' + m[1] + m[2] + ' ' + plur(m[1], 'ден', 'дена') + ' под таа граница'; });
  P(/^Daily RSI ([\d.]+)$/, function (m) { return 'Дневен RSI ' + m[1]; });
  P(/^Daily RSI ([\d.]+)\. Oversold alone has not beaten the market$/, function (m) { return 'Дневен RSI ' + m[1] + '. Самата препродаденост не го победи пазарот'; });
  P(/^Last 7 days ([^ ]+) against ([^ ]+) the week before$/, function (m) { return 'Последните 7 дена ' + m[1] + ' наспроти ' + m[2] + ' неделата пред тоа'; });
  P(/^Last 7 days ([^,]+), better than its 30-day pace of ([^ ]+) a week$/, function (m) { return 'Последните 7 дена ' + m[1] + ', подобро од нејзиното 30-дневно темпо од ' + m[2] + ' неделно'; });
  P(/^([^ ]+) in 24 hours$/, function (m) { return m[1] + ' за 24 часа'; });
  P(/^([\d.]+) long accounts per short, among the most long-heavy 10% of (\d+) perpetuals\. Crowded trades can unwind fast$/, function (m) { return m[1] + ' лонг сметки на една шорт, меѓу 10% најнаклонетите кон лонг од ' + m[2] + ' перпетуали. Преполните позиции може брзо да се одмотаат'; });
  P(/^([\d.]+) long accounts per short, among the most short-heavy 10% of (\d+) perpetuals\. This is the setup a short squeeze needs$/, function (m) { return m[1] + ' лонг сметки на една шорт, меѓу 10% најнаклонетите кон шорт од ' + m[2] + ' перпетуали. Тоа е условот што му треба на шорт-стискање'; });
  P(/^Longs paying heavily to stay in\. Crowded trades can unwind fast$/, function () { return 'Лонг позициите плаќаат многу за да останат. Преполните позиции може брзо да се одмотаат'; });
  P(/^Shorts paying longs\. This is the setup a short squeeze needs$/, function () { return 'Шорт позициите им плаќаат на лонг. Тоа е условот што му треба на шорт-стискање'; });
  P(/^Price ([^ ]+) while open interest ([^:]+): shorts closing, not new buyers$/, function (m) { return 'Цена ' + m[1] + ' додека отворениот интерес ' + m[2] + ': се затвораат шорт позиции, не доаѓаат нови купувачи'; });
  P(/^Taker buy\/sell ([\d.]+), top 15% of (\d+) perpetuals$/, function (m) { return 'Однос купување/продажба ' + m[1] + ', горни 15% од ' + m[2] + ' перпетуали'; });
  P(/^Taker buy\/sell ([\d.]+), bottom 15% of (\d+) perpetuals$/, function (m) { return 'Однос купување/продажба ' + m[1] + ', долни 15% од ' + m[2] + ' перпетуали'; });
  P(/^(\d+)% of coins at 4-hour RSI below (\d+)\. About the market, not this coin$/, function (m) { return m[1] + '% од монетите имаат 4-часовен RSI под ' + m[2] + '. За пазарот, не за оваа монета'; });
  P(/^Running hot · RSI\(14\) above 80$/, function () { return 'Прегреано · RSI(14) над 80'; });
  P(/^ETF flows: (.+)$/, function (m) { return 'Текови во ETF-овите: ' + m[1]; });
  P(/^([^ ]+) on the latest day, ([^ ]+) over 5 trading days\. Source: Farside Investors$/, function (m) { return m[1] + ' последниот ден, ' + m[2] + ' за 5 дена на тргување. Извор: Farside Investors'; });
  /* Score extras, market cells */
  P(/^#(\d+) · top (\d+)%$/, function (m) { return '#' + m[1] + ' · горни ' + m[2] + '%'; });
  P(/^no 30-day pullback yet \(30D ([^)]+)\)$/, function (m) { return 'сè уште без 30-дневно повлекување (30D ' + m[1] + ')'; });
  P(/^([\d.]+) → ([\d.]+) · (falling|rising|flat) across the recorded window$/, function (m) { return m[1] + ' → ' + m[2] + ' · ' + { falling: 'паѓа', rising: 'расте', flat: 'рамно' }[m[3]] + ' низ забележаниот период'; });
  P(/^([^ ]+) across the window$/, function (m) { return m[1] + ' низ периодот'; });
  P(/^now ([^ ]+) per 8h$/, function (m) { return 'сега ' + m[1] + ' на 8ч'; });
  P(/^([\d.]+) → ([\d.]+) long accounts per short$/, function (m) { return m[1] + ' → ' + m[2] + ' лонг сметки на една шорт'; });
  P(/^· (\d+) (pts|days)$/, function (m) { return '· ' + m[1] + ' ' + (m[2] === 'pts' ? 'точки' : 'дена'); });
  P(/^(OPEN INTEREST|FUNDING) · (\d+)H$/, function (m) { return (m[1] === 'FUNDING' ? 'ФАНДИНГ' : 'ОТВОРЕН ИНТЕРЕС') + ' · ' + m[2] + 'Ч'; });
  P(/^Longs and shorts are close to balanced\. Shown per 8h funding interval; roughly ([^ ]+) annualised\. Not part of the score\.$/, function (m) { return 'Лонг и шорт позициите се речиси избалансирани. Прикажано по 8-часовен интервал на фандинг; околу ' + m[1] + ' годишно. Не е дел од резултатот.'; });
  P(/^Longs are paying shorts\. Shown per 8h funding interval; roughly ([^ ]+) annualised\. Not part of the score\.$/, function (m) { return 'Лонг позициите им плаќаат на шорт. Прикажано по 8-часовен интервал на фандинг; околу ' + m[1] + ' годишно. Не е дел од резултатот.'; });
  P(/^Shorts are paying longs\. Shown per 8h funding interval; roughly ([^ ]+) annualised\. Not part of the score\.$/, function (m) { return 'Шорт позициите им плаќаат на лонг. Прикажано по 8-часовен интервал на фандинг; околу ' + m[1] + ' годишно. Не е дел од резултатот.'; });
  P(/^Total value of open perpetual positions on Binance\. Updated (\d+) min ago\.$/, function (m) { return 'Вкупна вредност на отворените перпетуал позиции на Binance. Ажурирано пред ' + m[1] + ' мин.'; });
  P(/^Aggressive buy\/sell flow is (unremarkable|heavy on the buy side|heavy on the sell side) compared with the rest of the market right now\. Ranked against (\d+) perpetuals, median ([\d.]+) — the market as a whole sits below 1\.0, so 1\.0 is not the neutral point\. Not part of the score\.$/,
    function (m) { return 'Агресивниот тек на купување/продажба ' + { 'unremarkable': 'е вообичаен', 'heavy on the buy side': 'е силен на страната на купување', 'heavy on the sell side': 'е силен на страната на продажба' }[m[1]] + ' во споредба со остатокот од пазарот. Рангирано наспроти ' + m[2] + ' перпетуали, медијана ' + m[3] + ' — пазарот како целина е под 1,0, па 1,0 не е неутралната точка. Не е дел од резултатот.'; });
  P(/^How far the perpetual trades from the spot index it settles against\. Premium means the perp is above spot\. Ranked against (\d+) perpetuals, median ([^ ]+) — most of the market sits slightly below spot, so 0 is not the neutral point\. Not part of the score\.$/,
    function (m) { return 'Колку перпетуалот тргува подалеку од спот индексот според кој се порамнува. Премија значи дека перпетуалот е над спот. Рангирано наспроти ' + m[1] + ' перпетуали, медијана ' + m[2] + ' — поголемиот дел од пазарот е малку под спот, па 0 не е неутралната точка. Не е дел од резултатот.'; });
  P(/^No historically-calibrated stretched\/oversold bands exist for ([A-Z0-9]+) yet\. Only Bitcoin Mayer Multiple has been validated against its own multi-year history\.$/, function (m) { return 'Сè уште нема историски калибрирани опсези за истегнато/препродадено за ' + m[1] + '. Само Mayer Multiple на Bitcoin е потврден наспроти сопствената повеќегодишна историја.'; });
  P(/^n\/a for ([A-Z0-9]+)$/, function (m) { return 'н/п за ' + m[1]; });
  P(/^(Golden|Death) cross — the 60-day average is (above|below) the 125-day average\. (Crossed today|Crossed (\d+) days? ago|The cross happened before the stored window, so its date is not known)\. Descriptive of past price only\.$/,
    function (m) {
      var when = m[3] === 'Crossed today' ? 'Се пресече денес' : m[4] ? 'Се пресече пред ' + m[4] + ' ' + plur(m[4], 'ден', 'дена') : 'Пресекувањето се случило пред зачуваниот период, па датумот не е познат';
      return (m[1] === 'Golden' ? 'Златен крст' : 'Крст на смртта') + ' — 60-дневниот просек е ' + (m[2] === 'above' ? 'над' : 'под') + ' 125-дневниот. ' + when + '. Опишува само минатата цена.';
    });
  P(/^Snapshot from ([\d-]+) · Pro sees today's live$/, function (m) { return 'Слика од ' + m[1] + ' · Pro го гледа денешното во живо'; });
  /* Insight Engine readings */
  P(/^RSI\((\d+)\) (Oversold|Low Momentum|Cooling|Overbought|Hot Zone|Warming)$/, function (m) { return 'RSI(' + m[1] + ') ' + RSI_ZONE[m[2]]; });
  P(/^Momentum Accelerating \(([^)]+)\)$/, function (m) { return 'Моментумот забрзува (' + m[1] + ')'; });
  P(/^Momentum Decelerating \(([^)]+)\)$/, function (m) { return 'Моментумот забавува (' + m[1] + ')'; });
  P(/^Recovery Trend \(([^ ]+) vs 30D\)$/, function (m) { return 'Тренд на опоравување (' + m[1] + ' наспроти 30D)'; });
  P(/^Weakening Trend \(([^ ]+) vs 30D\)$/, function (m) { return 'Тренд на слабеење (' + m[1] + ' наспроти 30D)'; });
  P(/^Supply Cleared \((\d+)% Unlocked\)$/, function (m) { return 'Понудата е ослободена (' + m[1] + '% отклучено)'; });
  P(/^High Dilution Risk \((\d+)% Unlocked\)$/, function (m) { return 'Висок ризик од разводнување (' + m[1] + '% отклучено)'; });
  P(/^Extreme Fear \((\d+)\) — historically a contrarian reading$/, function (m) { return 'Екстремен страв (' + m[1] + ') — историски контрарно читање'; });
  P(/^Fear Zone \((\d+)\)$/, function (m) { return 'Зона на страв (' + m[1] + ')'; });
  P(/^Extreme Greed \((\d+)\) — Caution$/, function (m) { return 'Екстремна алчност (' + m[1] + ') — внимание'; });
  P(/^Greed Zone \((\d+)\)$/, function (m) { return 'Зона на алчност (' + m[1] + ')'; });
  P(/^Hidden Strength vs BTC \(([^)]+)\)$/, function (m) { return 'Скриена сила наспроти BTC (' + m[1] + ')'; });
  P(/^Outperforming BTC \(([^)]+)\)$/, function (m) { return 'Подобра од BTC (' + m[1] + ')'; });
  P(/^Slight Edge vs BTC \(([^)]+)\)$/, function (m) { return 'Мала предност наспроти BTC (' + m[1] + ')'; });
  P(/^Underperforming BTC \(([^)]+)\)$/, function (m) { return 'Послаба од BTC (' + m[1] + ')'; });
  P(/^Lagging BTC \(([^)]+)\)$/, function (m) { return 'Заостанува зад BTC (' + m[1] + ')'; });
  P(/^BB Squeeze \(width ([^)]+)\) — volatility compressed$/, function (m) { return 'BB стеснување (ширина ' + m[1] + ') — компресирана волатилност'; });
  P(/^Price at (Lower|Upper) Band \(([^)]+)\)$/, function (m) { return 'Цена на ' + (m[1] === 'Lower' ? 'долната' : 'горната') + ' лента (' + m[2] + ')'; });
  P(/^Volume (Surge|Breakout) \(([^)]+) avg\)$/, function (m) { return (m[1] === 'Surge' ? 'Скок на обемот' : 'Пробив на обемот') + ' (' + m[2] + ' од просекот)'; });
  P(/^F&G: (\d+) \((Extreme Fear|Fear|Neutral|Greed|Extreme Greed)\)$/, function (m) { return 'F&G: ' + m[1] + ' (' + { 'Extreme Fear': 'екстремен страв', 'Fear': 'страв', 'Neutral': 'неутрално', 'Greed': 'алчност', 'Extreme Greed': 'екстремна алчност' }[m[2]] + ')'; });
  /* Lists, counters, alerts */
  P(/^(\d+) more in Pro$/, function (m) { return 'уште ' + m[1] + ' во Pro'; });
  /* RECORD: the April-August picks (dynamic lines) */
  P(/^Against the 100 largest coins only: ([\d.]+%)$/, function (m) { return 'Само наспроти 100-те најголеми монети: ' + m[1]; });
  P(/^To (\d{4}-\d\d-\d\d)$/, function (m) { return 'До ' + m[1]; });
  P(/^(BEST|WORST) 20 ROTATE-IN PICKS, TO (\d{4}-\d\d-\d\d)$/, function (m) { return (m[1] === 'BEST' ? 'НАЈДОБРИ' : 'НАЈЛОШИ') + ' 20 ИЗБОРИ ЗА ВЛЕЗ, ДО ' + m[2]; });
  /* RECORD: channel posts (HANDOVER.md Task 2) */
  P(/^Leadership: (BTC|large caps|small caps) took the lead from (BTC|large caps|small caps)$/, function (m) {
    var G = { 'BTC': 'BTC', 'large caps': 'големите монети', 'small caps': 'малите монети' };
    return 'Водство: ' + G[m[1]] + ' го презедоа водството од ' + G[m[2]];
  });
  P(/^(\d+) posts( · (\d+) of (\d+) held at 30 days)?$/, function (m) {
    return m[1] + ' ' + plur(m[1], 'објава', 'објави') + (m[2] ? ' · ' + m[3] + ' од ' + m[4] + ' се задржаа по 30 дена' : '');
  });
  P(/^unlock (\d+) more$/, function (m) { return 'отклучете уште ' + m[1]; });
  P(/^Show all (\d+)$/, function (m) { return 'Прикажи ги сите ' + m[1]; });
  P(/^\+(\d+) the other way$/, function (m) { return '+' + m[1] + ' во спротивна насока'; });
  P(/^(\d+) turn-sign and ETF alerts? on your coins\. Unlock with Pro$/, function (m) { return m[1] + ' ' + plur(m[1], 'известување', 'известувања') + ' за знаци за свртување и ETF за вашите монети. Отклучете со Pro'; });
  P(/^([\d.]+)% of supply unlocks within 30 days$/, function (m) { return m[1] + '% од понудата се отклучува во рок од 30 дена'; });
  P(/^Next unlock ([\d-]+)\.$/, function (m) { return 'Следно отклучување ' + m[1] + '.'; });
  P(/^([\d.]+)% unlocks within 30 days$/, function (m) { return m[1] + '% се отклучува во рок од 30 дена'; });
  P(/^Watching (.+)$/, function (m) { return 'Ја следите ' + m[1]; });
  /* Portfolio signal, rail, top bar */
  P(/^([−\-]?\d+) \/ (lagging|balanced|leading|strong|weak)$/, function (m) { return m[1] + ' / ' + { lagging: 'заостанува', balanced: 'избалансирано', leading: 'води', strong: 'силно', weak: 'слабо' }[m[2]]; });
  P(/^\/ 100 avg score$/, function () { return '/ 100 просечен резултат'; });
  P(/^(\d+) listed$/, function (m) { return m[1] + ' на листата'; });
  P(/^(\d+) ranked$/, function (m) { return m[1] + ' рангирани'; });
  P(/^(\d+) held$/, function (m) { return m[1] + ' во сопственост'; });
  P(/^UPDATED (.+)$/, function (m) { return 'АЖУРИРАНО ' + m[1]; });
  P(/^FEAR & GREED INDEX (\d+)$/, function (m) { return 'ИНДЕКС НА СТРАВ И АЛЧНОСТ ' + m[1]; });
  P(/^Crypto Fear & Greed Index — ([A-Za-z ]+)\. Market-wide sentiment, 0 = extreme fear, 100 = extreme greed\. Source: alternative\.me\.$/, function (m) { return 'Крипто индекс на страв и алчност — ' + ({ 'Extreme Fear': 'екстремен страв', 'Fear': 'страв', 'Neutral': 'неутрално', 'Greed': 'алчност', 'Extreme Greed': 'екстремна алчност' }[m[1]] || m[1]) + '. Расположение на целиот пазар, 0 = екстремен страв, 100 = екстремна алчност. Извор: alternative.me.'; });
  P(/^BTC (above|below) its 200-day average — Mayer Multiple ([\d.]+)× \((neutral zone|stretched|oversold)\)$/, function (m) { return 'BTC ' + (m[1] === 'above' ? 'над' : 'под') + ' својот 200-дневен просек — Mayer Multiple ' + m[2] + '× (' + { 'neutral zone': 'неутрална зона', stretched: 'истегнато', oversold: 'препродадено' }[m[3]] + ')'; });
  P(/^BTC (UPTREND|DOWNTREND) ([▲▼])$/, function (m) { return 'BTC ' + (m[1] === 'UPTREND' ? 'ВО ПОРАСТ' : 'ВО ПАД') + ' ' + m[2]; });
  P(/^updated (\d+)h ago$/, function (m) { return 'ажурирано пред ' + m[1] + 'ч'; });
  P(/^updated (\d+)d ago$/, function (m) { return 'ажурирано пред ' + m[1] + ' ' + plur(m[1], 'ден', 'дена'); });
  P(/^· updated (\d+)h ago$/, function (m) { return '· ажурирано пред ' + m[1] + 'ч'; });
  P(/^Updated (\d\d:\d\d:\d\d)$/, function (m) { return 'Ажурирано ' + m[1]; });
  P(/^© (\d{4}) ROTATOR · NOT FINANCIAL ADVICE ·$/, function (m) { return '© ' + m[1] + ' ROTATOR · НЕ Е ФИНАНСИСКИ СОВЕТ ·'; });
  /* Track record */
  P(/^STATS RESET ([\d·]+) — SCORING ENGINE (v[\d.]+) ACTIVE$/, function (m) { return 'СТАТИСТИКАТА Е РЕСЕТИРАНА ' + m[1] + ' — АКТИВЕН Е МОТОРОТ ЗА ОЦЕНУВАЊЕ ' + m[2]; });
  P(/^Tracking (\d+) days of signals on the v2 engine\. Results appear after 7 days\.$/, function (m) { return 'Се следат ' + m[1] + ' дена сигнали со моторот v2. Резултатите се појавуваат по 7 дена.'; });
  P(/^Where coins score against each other\. Information, not calls: across (\d+) days of history, moving from a high score into a low one did not beat picking two coins at random\. The live test is graded on the$/,
    function (m) { return 'Каде монетите се оценуваат една наспроти друга. Информација, не повик: низ ' + m[1] + ' дена историја, префрлањето од висок во низок резултат не беше подобро од случаен избор на две монети. Тестот во живо се оценува на'; });
  P(/^track record$/, function () { return 'евиденцијата'; });
  /* Swap */
  P(/^Amount of ([A-Z0-9]+)$/, function (m) { return 'Количина ' + m[1]; });
  P(/^([A-Z0-9]+) received per 1 ([A-Z0-9]+)$/, function (m) { return m[1] + ' добиени за 1 ' + m[2]; });
  P(/^(Bottom|Top) (\d+)% of this period’s range$/, function (m) { return (m[1] === 'Bottom' ? 'Долни ' : 'Горни ') + m[2] + '% од опсегот во овој период'; });
  P(/^Send \$(\d+)\+ to unlock ⚡ Pro instantly — auto-verified on the blockchain!$/, function (m) { return 'Испратете $' + m[1] + '+ за веднаш да го отклучите ⚡ Pro — автоматски проверено на блокчејнот!'; });
})();

/* ── Loading quotes, tour buttons, donate fragments (second pass) ── */
Object.assign(MK_TEXT, {
  '"A portfolio that survives is a portfolio that thrives."': '„Портфолио што опстојува е портфолио што напредува.“',
  '"Consistent small gains compound into big results."': '„Постојаните мали добивки се собираат во големи резултати.“',
  '"Diversify across sectors, not just coins."': '„Диверзифицирајте низ сектори, не само низ монети.“',
  '"Look for the evidence against it, not just the evidence for it."': '„Барајте ги доказите против, не само доказите за.“',
  '"Never invest more than you can afford to lose."': '„Никогаш не вложувајте повеќе отколку што можете да си дозволите да изгубите.“',
  '"Relative strength is measurable. A narrative is not."': '„Релативната сила може да се измери. Наративот не може.“',
  "\"The best trade is often the one you don't make.\"": '„Најдобрата трговија често е онаа што не ја правите.“',
  '"What changed is a better question than what to buy."': '„Што се сменило е подобро прашање од тоа што да се купи.“',
  '"Zoom out. The 30D trend tells a clearer story than the 1H chart."': '„Оддалечете се. Трендот за 30 дена кажува појасна приказна од графиконот за 1 час.“',
  'Next →': 'Следно →', 'Got it ✓': 'Разбрав ✓', 'Skip': 'Прескокни', 'Next:': 'Следно:',
  'features that pass their own tests': 'функции што ги поминуваат сопствените тестови',
  'Monthly Goal': 'Месечна цел', 'Copy': 'Копирај', 'not': 'не',
  'Submit your TX hash below — we verify it automatically on the blockchain. If the payment is confirmed and $20+,':
    'Внесете го TX хешот подолу — го проверуваме автоматски на блокчејнот. Ако плаќањето е потврдено и изнесува $20+,',
});
(function () {
  var P = function (re, fn) { MK_PATTERNS.push([re, fn]); };
  P(/^RSI ([\d.]+), (up|down) from ([\d.]+) the day before · ([\d-]+)$/, function (m) { return 'RSI ' + m[1] + ', ' + (m[2] === 'up' ? 'нагоре' : 'надолу') + ' од ' + m[3] + ' претходниот ден · ' + m[4]; });
  P(/^Price change over (\d+) days\. Click to sort\.$/, function (m) { return 'Промена на цената за ' + m[1] + ' дена. Кликнете за подредување.'; });
})();

/* ── track-record.html ──────────────────────────────────────────── */
Object.assign(MK_TEXT, {
  'ROTATOR — Signal Track Record': 'ROTATOR — Евиденција на сигналите',
  '← Back to app': '← Назад кон апликацијата', 'SIGNAL TRACK RECORD': 'ЕВИДЕНЦИЈА НА СИГНАЛИТЕ',
  'Every call, tracked.': 'Секој повик, следен.',
  'Rotator snapshots its top bullish, rotate-out and underperforming signals every day. After 30 days, we compare the call against':
    'Rotator секој ден ги зачувува своите најсилни биковски сигнали, сигнали за излез и сигнали за слаб учинок. По 30 дена, повикот го споредуваме со',
  'the median coin over the same 30 days': 'просечната монета во истите 30 дена',
  '— beating the market is the whole test, and half of all coins beat it by definition. The result is published here: the calls that beat it, the ones that moved our way but trailed it, and the ones that went the wrong way outright. The counter below restarted on':
    '— да се победи пазарот е целиот тест, а половина од сите монети го победуваат по дефиниција. Резултатот се објавува тука: повиците што го победија, оние што тргнаа во наша насока, но заостанаа, и оние што отидоа целосно во погрешна насока. Бројачот подолу почна одново на',
  'with scoring engine': 'со моторот за оценување',
  "; the retired v2 engine's final record is kept underneath it.": '; конечната евиденција на пензионираниот мотор v2 е зачувана под него.',
  'Every model change is logged here.': 'Секоја промена на моделот е запишана тука.',
  'Signal Accuracy': 'Точност на сигналите', 'Loading…': 'Се вчитува…',
  'Engine v2 — final record': 'Мотор v2 — конечна евиденција',
  'graded calls confirmed': 'оценети повици потврдени', 'Bar for this method:': 'Праг за овој метод:',
  '. A blanket call on every coin scored that, so the edge is the gap, not the distance to 50%': '. Општ повик за секоја монета го постигна тоа, па предноста е разликата, а не растојанието до 50%',
  'Bullish': 'Биковски', 'Underperforming': 'Слаб учинок', 'Rotate-out': 'За излез', 'All': 'Сите',
  'v2 did not separate rotate-out calls; they sit inside that 80.8%': 'v2 не ги одвојуваше повиците за излез; тие се дел од тие 80,8%',
  'Rotation Calls — Strong asset → Weak asset': 'Повици за ротација — силно средство → слабо средство',
  'Wins — Beat the market': 'Добитни — го победија пазарот',
  'Right direction — but the market did better': 'Точна насока — но пазарот беше подобар',
  'Misses — Moved against the call': 'Промашени — се движеа против повикот',
  'Download image': 'Преземи слика', 'Copy call as text': 'Копирај го повикот како текст',
  "See what's rotating right now": 'Погледнете што ротира во моментов',
  'Live readings across 250 coins, updated every 15 minutes. Free to use.': 'Читања во живо за 250 монети, ажурирани на секои 15 минути. Бесплатно за користење.',
  'Open Rotator →': 'Отвори го Rotator →',
  "The live counter reflects Rotator's": 'Бројачот во живо го одразува',
  'scoring engine, tracking from': 'моторот за оценување на Rotator, со следење од',
  '. Engine v2 (2026-04-26 → 2026-09-07) finished on 76.2% across 863 graded calls; its record is shown separately and is not blended into the live number — 2.1.0 changed how market cap enters the score, and 2.2.0 narrowed which coins are published at all. A call is "confirmed" when the coin':
    '. Моторот v2 (2026-04-26 → 2026-09-07) заврши на 76,2% од 863 оценети повици; неговата евиденција е прикажана посебно и не е измешана со бројот во живо — 2.1.0 го промени начинот на кој пазарната капитализација влегува во резултатот, а 2.2.0 го стесни изборот на монети што воопшто се објавуваат. Повикот е „потврден“ кога монетата',
  'beats the median coin': 'ја победува просечната монета',
  'over the 30 days following the snapshot, measured close-to-close on the same Binance daily candles for both. Half of all coins beat the median by definition, so':
    'во 30-те дена по снимката, мерено од затворање до затворање на истите дневни свеќи од Binance за двете. Половина од сите монети се над просечната монета, која е таа во средината, па',
  '50% is the bar': '50% е прагот',
  ', and a figure below it means the calls were worse than picking at random. Calls that fail are split in two, because they say different things:':
    ', а бројка под него значи дека повиците биле полоши од случаен избор. Неуспешните повици се делат на два дела, бидејќи кажуваат различни работи:',
  'right direction': 'точна насока',
  'means the coin moved the way we flagged but trailed the market, and': 'значи дека монетата се движеше како што означивме, но заостана зад пазарот, а',
  'misses': 'промашени',
  'Called:': 'Повикано:', 'Not old enough to grade yet': 'Сè уште не е доволно стар за оценување',
  'From Sep 18 to Sep 21 this page also graded the': 'Од 18 до 21 сеп оваа страница го оценуваше и',
  'reverse': 'обратното',
  'of every rotation call. A reversed call is the same two coins at the same prices, so its result is always the exact opposite of the real call: it could not tell us anything the figure above does not. The rotation rule is now judged against ranges written down before any call was old enough to grade.':
    'на секој повик за ротација. Обратниот повик е истите две монети по истите цени, па неговиот резултат е секогаш точно спротивен на вистинскиот повик: не можеше да ни каже ништо што бројката погоре не кажува. Правилото за ротација сега се оценува наспроти опсези запишани пред кој било повик да биде доволно стар за оценување.',
  'Engine v2 finished on': 'Моторот v2 заврши на',
  'across 863 graded calls. Graded on the best price in the window, so read it as an upper bound.': 'од 863 оценети повици. Оценето по најдобрата цена во периодот, па читајте го како горна граница.',
  'Every call is scored against the median coin over the same 30 days, so the bar is': 'Секој повик се оценува наспроти просечната монета во истите 30 дена, па прагот е',
  '— half of all coins beat the median by definition. Above it is skill; below it is not. The rotation record below compares two coins directly, and its bar is the same':
    '— просечната монета е таа во средината, па половина од монетите секогаш се над неа. Над него е вештина; под него не е. Евиденцијата за ротација подолу споредува две монети директно, а нејзиниот праг е истиот',
  '— measured, not assumed: random pairs over 30 days clear a positive spread 50.3% of the time.': '— измерен, не претпоставен: случајни парови за 30 дена имаат позитивна разлика во 50,3% од случаите.',
  'Nothing to show yet': 'Сè уште нема ништо за прикажување',
  'A call reaches the wins list by beating the median coin, in the direction we flagged, over the 30 days after it was made.':
    'Повикот влегува во листата на добитни ако ја победи просечната монета, во насоката што ја означивме, во 30-те дена откако е даден.',
  'Nothing in between': 'Ништо помеѓу',
  'Every graded call either beat the market or moved against the call outright.': 'Секој оценет повик или го победи пазарот или се движеше целосно против повикот.',
  'Nothing went against us': 'Ништо не отиде против нас',
  'No call moved against the direction we flagged. Misses are published beside the wins for honest accounting, so this list is shown empty rather than hidden.':
    'Ниту еден повик не се движеше против насоката што ја означивме. Промашените се објавуваат покрај добитните заради искрена евиденција, па оваа листа е прикажана празна наместо скриена.',
});
(function () {
  var P = function (re, fn) { MK_PATTERNS.push([re, fn]); };
  var plur = function (k, one, many) { return Number(k) === 1 ? one : many; };
  /* Pre-guard STG calls on the record (promptove/80). */
  P(/^(\d+) of these calls name a coin Binance is delisting and were made before the delisting guard went live on 25 Sep\. They stay on the record, graded at the conversion value \((.+)\)\.$/, function (m) { return m[1] + ' од овие повици се за монета што Binance ја отстранува од листата и се дадени пред заштитата за отстранување да проработи на 25 сеп. Остануваат во евиденцијата и се оценуваат по вредноста на конверзијата (' + m[2].replace(/ into /g, ' во ') + ').'; });
  P(/^Made before the delisting guard \(live since 25 Sep\)\. Binance is delisting ([A-Z0-9]+) and converting it into ([A-Z0-9]+), so this call is graded at that conversion value\.$/, function (m) { return 'Даден пред заштитата за отстранување од листата (активна од 25 сеп). Binance го отстранува ' + m[1] + ' од листата и го претвора во ' + m[2] + ', па овој повик се оценува по вредноста на таа конверзија.'; });
  P(/^Without the (\d+) graded calls? on coins Binance announced for delisting, made before the delisting guard:$/, function (m) { return 'Без ' + m[1] + ' ' + plur(m[1], 'оценет повик', 'оценети повици') + ' за монети што Binance ги најави за отстранување од листата, дадени пред заштитата:'; });
  P(/^\((\d+) of (\d+)\)\. The headline above keeps every call\.$/, function (m) { return '(' + m[1] + ' од ' + m[2] + '). Бројката погоре ги задржува сите повици.'; });
  P(/^(\d+) calls recorded, none old enough to grade yet \(needs 30\+ days\)\.$/, function (m) { return m[1] + ' повици се запишани, ниту еден сè уште не е доволно стар за оценување (потребни се 30+ дена).'; });
  P(/^(\d+) calls?$/, function (m) { return m[1] + ' ' + plur(m[1], 'повик', 'повици'); });
  P(/^(\d+)d ago$/, function (m) { return 'пред ' + m[1] + 'д'; });
  P(/^Pending — evaluates in (\d+)d$/, function (m) { return 'Чека — се оценува за ' + m[1] + 'д'; });
  P(/^Engine ([\d.]+) · since ([\d-]+)$/, function (m) { return 'Мотор ' + m[1] + ' · од ' + m[2]; });
  P(/^Engine ([\d.]+) · day (\d+) of tracking\. First graded calls in (\d+) days\.$/, function (m) { return 'Мотор ' + m[1] + ' · ден ' + m[2] + ' од следењето. Први оценети повици за ' + m[3] + ' ' + plur(m[3], 'ден', 'дена') + '.'; });
  P(/^Retired ([\d-]+)$/, function (m) { return 'Пензиониран ' + m[1]; });
  P(/^Shadow test · retired ([\d-]+)$/, function (m) { return 'Тест во сенка · пензиониран ' + m[1]; });
  P(/^(\d+) trading days · ([\d-]+) → ([\d-]+)$/, function (m) { return m[1] + ' дена на тргување · ' + m[2] + ' → ' + m[3]; });
})();

/* ── Loading screen, rail subtitles, swap leftovers (third pass) ── */
Object.assign(MK_TEXT, {
  'Binance prices loaded — fetching historical data…': 'Цените од Binance се вчитани — се вчитуваат историските податоци…',
  'Reading market data…': 'Се читаат пазарните податоци…',
  'best and worst': 'најдобри и најлоши', 'every tracked coin': 'секоја следена монета', 'pair ratio': 'однос на пар',
  'BTC: LOADING': 'BTC: СЕ ВЧИТУВА',
  'No saved pairs yet — pick a pair and click ☆ Save pair': 'Сè уште нема зачувани парови — изберете пар и кликнете ☆ Зачувај пар',
  'peak': 'врв',
});
(function () {
  var P = function (re, fn) { MK_PATTERNS.push([re, fn]); };
  P(/^Fetching market data for (.+) coins…$/, function (m) { return 'Се вчитуваат пазарните податоци за монетите ' + m[1] + '…'; });
  P(/^Loaded (\d+) coins from shared cache$/, function (m) { return 'Вчитани ' + m[1] + ' монети од заедничкиот кеш'; });
  P(/^Fetching data for (\d+) coins \((\d+) batch(es)?\)(.*)$/, function (m) { return 'Се вчитуваат податоци за ' + m[1] + ' монети (' + m[2] + (Number(m[2]) === 1 ? ' серија' : ' серии') + ')' + m[4]; });
})();

/* ── Since the sign + paper trades (promptove/76) ───────────────── */
Object.assign(MK_TEXT, {
  'PAPER TRADES': 'ПРОБНИ ПОЗИЦИИ', 'PAPER': 'ПРОБНА', 'paper': 'пробно',
  'Track from this sign': 'Следи од овој знак',
  'Remove paper trade': 'Отстрани ја пробната позиција',
  'Already tracking this sign.': 'Овој знак веќе го следите.',
  'Open a coin, expand a turn sign and tap “Track from this sign” to see how it would have done if you had bought then. Paper trades never count as holdings.':
    'Отворете монета, отворете знак за свртување и допрете „Следи од овој знак“ за да видите како би поминале ако сте купиле тогаш. Пробните позиции никогаш не се бројат како позиции.',
  'new': 'ново',
  'The sign is from the latest close; its result starts tomorrow.': 'Знакот е од последното затворање; неговиот резултат почнува од утре.',
});
(function () {
  var P = function (re, fn) { MK_PATTERNS.push([re, fn]); };
  var MON = { Jan: 'јан', Feb: 'фев', Mar: 'мар', Apr: 'апр', May: 'мај', Jun: 'јун', Jul: 'јул', Aug: 'авг', Sep: 'сеп', Oct: 'окт', Nov: 'ное', Dec: 'дек' };
  var plur = function (k, one, many) { return Number(k) === 1 ? one : many; };
  P(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, function (m) { return m[1] + ' ' + MON[m[2]]; });
  P(/^([+−\-][\d.]+) vs mkt$/, function (m) { return m[1] + ' наспроти пазарот'; });
  P(/^Since the (\d{1,2}) (\w{3}) close: ([^,]+), market median ([^ ]+) \(([^ ]+) points\), (\d+) days?\.$/,
    function (m) { return 'Од затворањето на ' + m[1] + ' ' + (MON[m[2]] || m[2]) + ': ' + m[3] + ', просек на пазарот ' + m[4] + ' (' + m[5] + ' поени), ' + m[6] + ' ' + plur(m[6], 'ден', 'дена') + '.'; });
  P(/^Since (\d{1,2}) (\w{3}): too early, the result starts after the next daily close\.$/,
    function (m) { return 'Од ' + m[1] + ' ' + (MON[m[2]] || m[2]) + ': прерано е, резултатот почнува по следното дневно затворање.'; });
  /* An alert's detail with the result sentence appended: translate the two halves. */
  P(/^(.+?) (Since (?:the )?\d{1,2} \w{3}.+)$/, function (m) { return window.mkTranslate(m[1]) + ' ' + window.mkTranslate(m[2]); });
  P(/^from (\$[\d.e+\-]+|—)$/, function (m) { return 'од ' + m[1]; });
  P(/^(\d+) days?$/, function (m) { return m[1] + ' ' + plur(m[1], 'ден', 'дена'); });
  P(/^([A-Z0-9]+) added as a paper trade from (\d{1,2}) (\w{3})\.$/, function (m) { return m[1] + ' е додадена како пробна позиција од ' + m[2] + ' ' + (MON[m[3]] || m[3]) + '.'; });
  P(/^Paper trade limit reached \((\d+)\)\.$/, function (m) { return 'Достигнат е лимитот на пробни позиции (' + m[1] + ').'; });
})();

/* ── Track from now (promptove/77) ──────────────────────────────── */
Object.assign(MK_TEXT, {
  'Track from now': 'Следи од сега', 'Entry price ($)': 'Влезна цена ($)', 'From': 'Од', 'Track': 'Следи',
  'From now': 'Од сега', 'Your entry': 'Ваш влез',
  'Already tracking this entry.': 'Овој влез веќе го следите.',
  'Enter an entry price above zero.': 'Внесете влезна цена поголема од нула.',
});
(function () {
  MK_PATTERNS.push([/^(\d+) paper trades? on this coin$/, function (m) { return m[1] + ' ' + (Number(m[1]) === 1 ? 'пробна позиција' : 'пробни позиции') + ' за оваа монета'; }]);
})();

/* ── Referral progress (2026-09-29) ─────────────────────────────── */
Object.assign(MK_TEXT, {
  'A friend counts once Rotator has fully loaded for them through your link. Each friend counts once, and is confirmed 1 hour after their visit.':
    'Пријателот се брои откако Rotator целосно ќе му се вчита преку вашиот линк. Секој пријател се брои еднаш и се потврдува 1 час по посетата.',
  'All 5 friends have joined. Pro unlocks automatically once the 1-hour check has passed: refresh the page to check.':
    'Сите 5 пријатели се приклучија. Pro се отклучува автоматски штом помине проверката од 1 час: освежете ја страницата за да проверите.',
});
(function () {
  var P = function (re, fn) { MK_PATTERNS.push([re, fn]); };
  P(/^Share your link\. When (\d+) more friends? opens? Rotator through it, the full features unlock\.$/, function (m) {
    return 'Споделете го вашиот линк. Кога уште ' + m[1] + ' ' + (m[1] === '1' ? 'пријател ќе го отвори' : 'пријатели ќе го отворат')
      + ' Rotator преку него, се отклучуваат сите функции.';
  });
  P(/^(\d+) friends? (?:is|are) waiting for the 1-hour check\.$/, function (m) {
    return m[1] + ' ' + (m[1] === '1' ? 'пријател чека' : 'пријатели чекаат') + ' на проверката од 1 час.';
  });
})();
