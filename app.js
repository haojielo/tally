/* Tally — private, on-device bookkeeping.
 * Every record lives only in this browser's IndexedDB on this device.
 * The only network requests are exchange-rate lookups, which carry nothing but currency codes. */

const APP_VERSION = '1.0.3';
const BOOT_AT = Date.now();
const DEMO = document.documentElement.dataset.demo === '1';
const BASE = 'SEK';
const te = new TextEncoder();
const td = new TextDecoder();

/* ───────────────────────── utilities ───────────────────────── */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RAW = Symbol('raw');
const raw = s => ({ [RAW]: true, s: String(s ?? '') });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function out(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(out).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}
function html(strings, ...vals) {
  let s = strings[0];
  for (let i = 0; i < vals.length; i++) s += out(vals[i]) + strings[i + 1];
  return raw(s);
}
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : [...rand(16)].map(b => b.toString(16).padStart(2, '0')).join(''));
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = u8 => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64ud = s => b64d(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const roundDp = (n, dp) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const monthOf = s => s.slice(0, 7);
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, k) => { const d = parseYmd(s); d.setDate(d.getDate() + k); return ymd(d); };
const addMonths = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dayDiff = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
const monthRange = ym => [ym + '-01', ym + '-' + pad(daysIn(ym))];
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class AppError extends Error { constructor(code, cause) { super(code); this.code = code; this.cause = cause; } }

/* ───────────────────────── strings ───────────────────────── */

const STR = {
  zh: {
    appName: 'Tally', locale: 'zh-CN',
    tabHome: '明细', tabStats: '统计', tabBudget: '预算', tabSettings: '设置', add: '记一笔',
    expense: '支出', income: '收入', net: '结余', spent: '本月支出', spentIn: '{m}支出', count: '笔数',
    today: '今天', yesterday: '昨天',
    search: '搜索', searchPh: '搜索备注、分类或金额', searchCount: '找到 {n} 笔', clear: '清除', closeSearch: '关闭搜索',
    pickMonth: '选择月份', prevMonth: '上个月', nextMonth: '下个月', prev: '上一个', next: '下一个',
    emptyTitle: '这个月还没有记录', emptySub: '点下方的 + 记下第一笔，或者导入银行账单。', addFirst: '记一笔', noResults: '没有找到匹配的记录',
    budgetLeft: '预算还剩 {v}', budgetOver: '超出预算 {v}', perDay: '每天可用 {v}', setBudgetShort: '设置月度预算',
    cancel: '取消', done: '完成', save: '保存', delete: '删除', ok: '确定', close: '关闭', edit: '编辑', continue: '继续',
    notePh: '添加备注', date: '日期', currency: '币种',
    saved: '已保存', deleted: '已删除', enterAmount: '先输入金额', delTitle: '删除这笔记录？', delMsg: '删除后无法恢复。', negative: '金额需要大于 0',
    rateLoading: '正在获取汇率…', rateMissing: '还没有汇率，点这里手动输入', needRate: '缺少汇率，请联网后重试或手动输入',
    rateTitle: '汇率', rateFor: '1 {c} 等于多少瑞典克朗', rateDateNote: '{d} 的参考汇率', useLatest: '使用最新汇率', rateUpdated: '汇率已更新', rateFail: '获取汇率失败，请检查网络', rateInvalid: '请输入有效的汇率',
    chooseCur: '选择币种', curSearchPh: '搜索币种代码或名称',
    newCat: '新分类', editCat: '编辑分类', catName: '名称', catIcon: '图标', catColor: '颜色', catNamePh: '比如：咖啡', delCat: '删除分类', delCatMsg: '这个分类下的 {n} 笔记录会移到“其他”。', otherLocked: '“其他”分类不能删除', catSaved: '分类已保存', catDeleted: '分类已删除', needName: '先填写名称',
    cat_food: '餐饮', cat_groceries: '超市', cat_transport: '交通', cat_housing: '住房', cat_utilities: '水电通讯', cat_shopping: '购物', cat_fun: '娱乐', cat_subs: '订阅', cat_health: '医疗健康', cat_study: '学习', cat_travel: '旅行', cat_gifts: '人情', cat_other: '其他',
    cat_salary: '工资', cat_allowance: '生活费', cat_grant: '奖学金', cat_parttime: '兼职', cat_invest: '理财', cat_giftIn: '红包礼金', cat_refund: '退款', cat_otherIn: '其他',
    month: '月', year: '年', totalSpent: '总支出', totalIncome: '总收入', dailyAvg: '日均', monthlyAvg: '月均', vsLastMonth: '较上月', vsLastYear: '较去年',
    byCategory: '分类排行', dailyTrend: '每日走势', monthlyTrend: '每月走势', nEntries: '{n} 笔', statsEmpty: '这段时间没有{type}记录', yearLabel: '{y}年', avgLine: '平均',
    budgetTitle: '月度预算', setBudget: '设置月度预算', editBudget: '修改预算', budgetEmptyTitle: '还没有设置预算', budgetEmptySub: '设定每月的支出上限，这里会显示花费进度，以及接下来每天还能花多少。',
    left: '还剩', over: '已超支', spentOfTotal: '已用，预算 {v}', perDayLeft: '剩余 {n} 天，每天可用', used: '已用', monthEnded: '这个月已结束',
    catBudgets: '分类预算', addCatBudget: '添加分类预算', catBudgetEmpty: '也可以给餐饮、购物等分类单独设上限。', budgetAmount: '每月金额', budgetHint: '每个月都按这个金额计算。', removeBudget: '移除预算',
    budgetSaved: '预算已保存', budgetRemoved: '预算已移除', chooseCat: '选择分类', allBudgeted: '所有支出分类都已设置预算', amountInvalid: '请输入有效的金额',
    security: '安全', faceLock: '面容 ID 解锁', pinLock: '密码锁', autoLock: '自动锁定', lockNow: '立即', lock1: '1 分钟后', lock5: '5 分钟后', lock15: '15 分钟后', changePin: '修改备用密码',
    faceNoSupport: '这台设备不支持面容 ID，将只使用 6 位密码上锁。', faceFailedFallback: '面容 ID 没有设置成功。要只用 6 位密码上锁吗？', usePinOnly: '只用密码', faceCancelled: '已取消',
    lockOn: '已开启面容 ID 解锁', pinOn: '已开启密码锁', lockOff: '已关闭解锁保护', pinChanged: '备用密码已修改',
    appearance: '外观', theme: '主题', themeSystem: '跟随系统', themeLight: '浅色', themeDark: '深色', language: '语言', langSystem: '跟随系统',
    dataSec: '账单与数据', importTitle: '导入账单', categories: '分类管理', backupExport: '导出加密备份', backupRestore: '从备份恢复', csvExport: '导出 CSV 表格', eraseAll: '清除所有数据',
    lastBackup: '上次备份：{v}', never: '从未', daysAgo: '{n} 天前', todayAgo: '今天',
    ratesSec: '货币与汇率', baseCur: '记账主货币', dispCur: '显示货币', otherCur: '其他币种',
    dispCurNote: '合计、统计和预算会按最新汇率换算成显示货币，每笔外币记录仍保留原来的金额。', noRateYet: '还没有 {c} 的汇率，联网后再试', dispSet: '金额改为用 {c} 显示',
    budgetInSek: '预算以瑞典克朗记录，按最新汇率换算后显示。', unitCNY: '元', ratesUpdated: '{d}的汇率', ratesNone: '尚未获取', refresh: '刷新汇率',
    ratesSource: '汇率来自 frankfurter.dev，汇集欧洲央行等各国央行每日公布的参考汇率。每笔外币记录会锁定记账时的汇率，之后不会变动。',
    about: '关于', version: '版本', privacyText: '所有账目只保存在这台设备的浏览器存储里，不会上传到任何服务器，也没有任何统计或追踪代码。唯一的网络请求是获取汇率，请求里只有币种代码，不含任何账目。',
    lockedSub: '账本已锁定', unlockFace: '使用面容 ID 解锁', usePin: '使用备用密码', useFace: '改用面容 ID', enterPin: '输入备用密码',
    wrongPin: '密码不对，请再试一次', tooMany: '尝试次数太多，请 {s} 秒后再试', faceFailed: '面容 ID 未通过，可以改用备用密码',
    pinSetTitle: '设置备用密码', pinNew: '输入 6 位备用密码', pinConfirm: '再输入一次', pinMismatch: '两次输入不一致，请重新设置', pinWhy: '面容 ID 不可用时，用它解锁。请记牢，忘记后无法找回数据。',
    verifyTitle: '验证身份', verifySub: '用面容 ID 或备用密码确认是你本人',
    backupTitle: '导出加密备份', backupPw: '备份密码', backupPw2: '再输入一次', backupPwPh: '至少 6 位', backupWhy: '备份文件会用这个密码加密（AES-256）。忘记密码将无法恢复，建议存进密码管理器。',
    pwShort: '密码至少 6 位', pwMismatch: '两次输入的密码不一致', makeBackup: '生成备份', making: '正在加密…', backupReady: '备份已生成', backupReadySub: '保存到“文件”或 iCloud 云盘，换手机时用它恢复。',
    saveFile: '保存文件', backupDone: '备份已导出', restoreTitle: '恢复备份', restorePw: '输入备份密码', restoreGo: '解密并恢复',
    restoreConfirm: '恢复后会替换现在的所有记录', restoreConfirmMsg: '备份里有 {n} 笔记录，导出于 {d}。当前的 {m} 笔记录会被替换。', restoreOk: '替换并恢复',
    restored: '已恢复 {n} 笔记录', wrongBackupPw: '密码不对，或者文件已损坏', notBackup: '这不是 Tally 的备份文件',
    csvWarnTitle: '导出未加密的表格？', csvWarnMsg: 'CSV 文件没有加密，任何拿到文件的人都能看到全部账目。', csvOk: '导出', csvDone: '已导出 CSV',
    eraseTitle: '清除所有数据？', eraseMsg: '所有记录、分类和预算都会被删除，无法恢复。建议先导出备份。', eraseOk: '全部清除', erased: '已清除所有数据',
    impPrivacy: '文件只在这台手机上读取和识别，不会上传到任何地方。', impFile: '选择文件', impFileSub: 'CSV、Excel 或 PDF 对账单', impPaste: '粘贴文本', impPasteSub: '从网银复制交易列表后粘贴',
    impPastePh: '把网银里的交易记录复制后粘贴到这里，每笔需要包含日期和金额', impRead: '识别', impReading: '正在识别…', impPasteEmpty: '先粘贴交易文本',
    icaHowTitle: '怎样从 ICA Banken 导出账单',
    icaHow1: '在电脑浏览器登录 ICA Banken 网银（手机 App 里没有导出功能）。',
    icaHow2: '打开“Konton”，进入要导出的账户，在交易列表处选择导出，保存为 CSV 或 Excel 文件。',
    icaHow3: '找不到导出按钮时，可以在“Dokument → Konton”下载 PDF 月结单，或直接选中网页上的交易列表复制，再用“粘贴文本”导入。',
    icaHow4: '把文件存到 iCloud 云盘或用 AirDrop 发到手机，再在这里选择文件。',
    impNothing: '没有识别到交易记录。可以展开“列对应”手动指定，或改用粘贴文本。', impOldXls: '这是旧版 .xls 格式，请在 Excel 或 Numbers 中另存为 .xlsx 或 CSV 后再导入。',
    impBadFile: '无法读取这个文件', impPdfFail: 'PDF 读取失败，可以改用 CSV 或粘贴文本', impPdfDemo: '预览版不支持 PDF，正式版可以',
    impPdfNoText: '这个 PDF 里没有可以读取的文字，可能是扫描件。请改用 CSV、Excel，或者粘贴网银里的交易列表。', impPdfNeedPw: '这个 PDF 设了打开密码', impPdfWrongPw: '密码不对，请再试一次',
    impPdfPwTitle: 'PDF 密码', impPdfPwLead: '这个 PDF 设了打开密码。密码只用来在这台手机上打开文件，不会保存。', impOpen: '打开', impAllDup: '这份账单里的交易之前都已经导入过了。',
    diagLead: '下面的格式信息只保留了文件的结构：所有字母都换成了 a，数字都换成了 9，不含真实的金额、日期和名称，可以放心发给帮你排查的人。',
    diagCopy: '复制格式信息', diagCopied: '格式信息已复制', diagSelect: '已选中格式信息，请手动复制', diagShow: '查看内容', diagWrong: '识别得不对？复制格式信息',
    impFound: '{n} 笔交易', impRange: '{a} 至 {b}', impDup: '{n} 笔之前已导入过，已自动跳过。', impUnchecked: '转账、未入账和可能已手动记过的 {n} 笔默认不导入，需要时可以勾选。',
    impAllPositive: '所有金额都是正数。如果这是信用卡账单，点“正负号互换”。', impFlip: '正负号互换', impAll: '全选', impNone: '全不选', impCur: '账单币种',
    impMap: '列对应', impMapSum: '日期 {d}，说明 {t}，金额 {a}', impColDate: '日期列', impColText: '说明列', impColAmt: '金额列', impColBal: '余额列（可选）', impColNone: '无',
    impGo: '导入 {n} 笔', impDone: '已导入 {n} 笔', impNoneSel: '请至少选择一笔', tagTransfer: '转账', tagPending: '未入账', tagMaybe: '可能已记过',
    srcText: '粘贴的文本', srcCSV: 'CSV 表格', srcExcel: 'Excel 表格', srcPDF: 'PDF 对账单',
    installTitle: '添加到主屏幕', installText: '在 Safari 中点“分享”，选“添加到主屏幕”。以后请从主屏幕图标打开，那里的数据和 Safari 里是分开保存的。',
    nagTitle: '该备份了', nagText: '已经 {n} 天没有备份。删除主屏幕图标或换手机时，没有备份的数据会一起消失。', nagNever: '还没有备份过。删除主屏幕图标或换手机时，没有备份的数据会一起消失。', backupNow: '立即备份', later: '稍后',
    volatile: '当前浏览器无法长期保存数据（可能处于无痕模式），关闭后记录会丢失。',
    demoBanner: '这是预览版：数据只是示例，刷新后会还原，请不要录入真实账目。',
    demoNoFile: '预览版不能导出或恢复文件，装到主屏幕的正式版可以',
    updateReady: '新版本已就绪', reload: '重新载入', offline: '当前离线',
    updateBanner: '新版本已经下载好，重新载入后就能使用。',
    palette: '配色', icon: '图标', pal_harbor: '港湾', pal_ledger: '账簿', pal_receipt: '小票', pal_piggy: '存钱罐', pal_coin: '金币',
    iconHintApp: '主屏幕图标在添加时就固定了，换成新图标需要重新添加一次。', iconHintSafari: '选好后点 Safari 的“分享”→“添加到主屏幕”，就会用这个图标。',
    iconSteps: '怎样换图标', iconStepsTitle: '更换主屏幕图标', iconStep1: '在这里的“设置”里导出加密备份。', iconStep2: '用 Safari 打开 {url}，在“设置”里选好图标。',
    iconStep3: '点 Safari 的“分享”，选“添加到主屏幕”。', iconStep4: '打开新的 Tally 图标，用“从备份恢复”导入刚才的备份。', iconStep5: '确认记录都在以后，再删除旧图标。',
    storeWhere: '数据存放位置', storeApp: '主屏幕上的 Tally', storeSafari: 'Safari 网页', storeBrowser: '这个浏览器',
    storePersist: '已开启长期保存，系统不会自动清理', storeNoPersist: '未开启长期保存，手机空间不足时可能被清理', storeUnknown: '只保存在这台设备上',
    safariTitle: '这些记录存在 Safari 里', safariText: '主屏幕上的 Tally 看不到这里的记录，Safari 也可能清理很久没访问的网站数据。请导出加密备份，再到主屏幕的 Tally 里恢复。', exportBackup: '导出备份',
    nagNew: '上次备份以后又多了 {n} 笔记录。删除主屏幕图标或换手机时，没有备份的记录会一起消失。',
    monthSummary: '本月汇总', moreActions: '更多',
  },
  en: {
    appName: 'Tally', locale: 'en-US',
    tabHome: 'Ledger', tabStats: 'Stats', tabBudget: 'Budget', tabSettings: 'Settings', add: 'Add entry',
    expense: 'Expense', income: 'Income', net: 'Net', spent: 'Spent this month', spentIn: 'Spent in {m}', count: 'Entries',
    today: 'Today', yesterday: 'Yesterday',
    search: 'Search', searchPh: 'Search notes, categories or amounts', searchCount: '{n} found', clear: 'Clear', closeSearch: 'Close search',
    pickMonth: 'Choose month', prevMonth: 'Previous month', nextMonth: 'Next month', prev: 'Previous', next: 'Next',
    emptyTitle: 'Nothing recorded this month', emptySub: 'Tap + below to add your first entry, or import a bank statement.', addFirst: 'Add entry', noResults: 'No matching entries',
    budgetLeft: '{v} left in budget', budgetOver: '{v} over budget', perDay: '{v} a day', setBudgetShort: 'Set a monthly budget',
    cancel: 'Cancel', done: 'Done', save: 'Save', delete: 'Delete', ok: 'OK', close: 'Close', edit: 'Edit', continue: 'Continue',
    notePh: 'Add a note', date: 'Date', currency: 'Currency',
    saved: 'Saved', deleted: 'Deleted', enterAmount: 'Enter an amount first', delTitle: 'Delete this entry?', delMsg: 'This can’t be undone.', negative: 'The amount must be above 0',
    rateLoading: 'Getting exchange rate…', rateMissing: 'No rate yet. Tap to enter one', needRate: 'Exchange rate missing. Go online or enter one manually',
    rateTitle: 'Exchange rate', rateFor: 'How many kronor is 1 {c}', rateDateNote: 'Reference rate for {d}', useLatest: 'Use latest rate', rateUpdated: 'Rate updated', rateFail: 'Couldn’t get rates. Check your connection', rateInvalid: 'Enter a valid rate',
    chooseCur: 'Choose currency', curSearchPh: 'Search code or name',
    newCat: 'New', editCat: 'Edit category', catName: 'Name', catIcon: 'Icon', catColor: 'Color', catNamePh: 'e.g. Coffee', delCat: 'Delete category', delCatMsg: '{n} entries in this category will move to Other.', otherLocked: 'Other can’t be deleted', catSaved: 'Category saved', catDeleted: 'Category deleted', needName: 'Enter a name first',
    cat_food: 'Dining', cat_groceries: 'Groceries', cat_transport: 'Transport', cat_housing: 'Housing', cat_utilities: 'Bills', cat_shopping: 'Shopping', cat_fun: 'Fun', cat_subs: 'Subscriptions', cat_health: 'Health', cat_study: 'Study', cat_travel: 'Travel', cat_gifts: 'Gifts', cat_other: 'Other',
    cat_salary: 'Salary', cat_allowance: 'Allowance', cat_grant: 'Scholarship', cat_parttime: 'Side job', cat_invest: 'Investments', cat_giftIn: 'Gifts', cat_refund: 'Refunds', cat_otherIn: 'Other',
    month: 'Month', year: 'Year', totalSpent: 'Total spent', totalIncome: 'Total income', dailyAvg: 'Daily avg', monthlyAvg: 'Monthly avg', vsLastMonth: 'vs last month', vsLastYear: 'vs last year',
    byCategory: 'By category', dailyTrend: 'Day by day', monthlyTrend: 'Month by month', nEntries: '{n} entries', nEntries_1: '1 entry', daysAgo_1: 'yesterday', perDayLeft_1: 'Last day, you can spend', delCatMsg_1: '1 entry in this category will move to Other.', impFound_1: '1 transaction', impDup_1: '1 was imported before and is skipped.', restored_1: 'Restored 1 entry', impUnchecked_1: '1 transfer, pending or possibly already recorded entry is unchecked. Tick it if you want it.', statsEmpty: 'No {type} in this period', yearLabel: '{y}', avgLine: 'avg',
    budgetTitle: 'Monthly budget', setBudget: 'Set a monthly budget', editBudget: 'Edit budget', budgetEmptyTitle: 'No budget yet', budgetEmptySub: 'Set a monthly spending limit to see your progress and how much you can spend each day.',
    left: 'Left', over: 'Over', spentOfTotal: 'Spent of {v}', perDayLeft: '{n} days left, per day', used: 'used', monthEnded: 'This month has ended',
    catBudgets: 'Category budgets', addCatBudget: 'Add category budget', catBudgetEmpty: 'You can also cap single categories like dining or shopping.', budgetAmount: 'Amount per month', budgetHint: 'Applies to every month.', removeBudget: 'Remove budget',
    budgetSaved: 'Budget saved', budgetRemoved: 'Budget removed', chooseCat: 'Choose category', allBudgeted: 'Every expense category has a budget', amountInvalid: 'Enter a valid amount',
    security: 'Security', faceLock: 'Unlock with Face ID', pinLock: 'Passcode lock', autoLock: 'Auto-lock', lockNow: 'Immediately', lock1: 'After 1 min', lock5: 'After 5 min', lock15: 'After 15 min', changePin: 'Change backup passcode',
    faceNoSupport: 'Face ID isn’t available here, so a 6-digit passcode will lock the app.', faceFailedFallback: 'Face ID couldn’t be set up. Lock with a 6-digit passcode only?', usePinOnly: 'Passcode only', faceCancelled: 'Cancelled',
    lockOn: 'Face ID unlock is on', pinOn: 'Passcode lock is on', lockOff: 'Unlock protection is off', pinChanged: 'Backup passcode changed',
    appearance: 'Appearance', theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark', language: 'Language', langSystem: 'System',
    dataSec: 'Statements & data', importTitle: 'Import statement', categories: 'Categories', backupExport: 'Export encrypted backup', backupRestore: 'Restore from backup', csvExport: 'Export CSV', eraseAll: 'Erase all data',
    lastBackup: 'Last backup: {v}', never: 'never', daysAgo: '{n} days ago', todayAgo: 'today',
    ratesSec: 'Currency & rates', baseCur: 'Bookkeeping currency', dispCur: 'Display currency', otherCur: 'Other currencies',
    dispCurNote: 'Totals, stats and budgets are converted to the display currency at the latest rate. Foreign-currency entries keep their original amounts.', noRateYet: 'No rate for {c} yet. Go online and try again', dispSet: 'Amounts now shown in {c}',
    budgetInSek: 'Budgets are kept in kronor and converted at the latest rate for display.', unitCNY: 'CNY', ratesUpdated: 'Rates from {d}', ratesNone: 'Not fetched yet', refresh: 'Refresh rates',
    ratesSource: 'Rates come from frankfurter.dev, which collects the daily reference rates published by the ECB and other central banks. Each foreign-currency entry keeps the rate from when it was recorded.',
    about: 'About', version: 'Version', privacyText: 'Every entry stays in this device’s browser storage. Nothing is uploaded and there is no analytics or tracking. The only network request fetches exchange rates and contains currency codes only.',
    lockedSub: 'Your ledger is locked', unlockFace: 'Unlock with Face ID', usePin: 'Use passcode', useFace: 'Use Face ID instead', enterPin: 'Enter passcode',
    wrongPin: 'Wrong passcode. Try again', tooMany: 'Too many attempts. Try again in {s}s', faceFailed: 'Face ID didn’t pass. You can use your passcode',
    pinSetTitle: 'Set backup passcode', pinNew: 'Enter a 6-digit passcode', pinConfirm: 'Enter it again', pinMismatch: 'Passcodes didn’t match. Start over', pinWhy: 'Use it when Face ID isn’t available. Keep it safe: without it your data can’t be recovered.',
    verifyTitle: 'Confirm it’s you', verifySub: 'Use Face ID or your backup passcode',
    backupTitle: 'Encrypted backup', backupPw: 'Backup password', backupPw2: 'Repeat password', backupPwPh: 'At least 6 characters', backupWhy: 'The file is encrypted with this password (AES-256). Without it the backup can’t be restored, so keep it in a password manager.',
    pwShort: 'Use at least 6 characters', pwMismatch: 'The passwords don’t match', makeBackup: 'Create backup', making: 'Encrypting…', backupReady: 'Backup ready', backupReadySub: 'Save it to Files or iCloud Drive. Use it to restore on a new phone.',
    saveFile: 'Save file', backupDone: 'Backup exported', restoreTitle: 'Restore backup', restorePw: 'Backup password', restoreGo: 'Decrypt and restore',
    restoreConfirm: 'Restoring replaces every current entry', restoreConfirmMsg: 'The backup has {n} entries, exported on {d}. Your current {m} entries will be replaced.', restoreOk: 'Replace and restore',
    restored: 'Restored {n} entries', wrongBackupPw: 'Wrong password, or the file is damaged', notBackup: 'This isn’t a Tally backup file',
    csvWarnTitle: 'Export an unencrypted table?', csvWarnMsg: 'CSV files aren’t encrypted. Anyone with the file can read every entry.', csvOk: 'Export', csvDone: 'CSV exported',
    eraseTitle: 'Erase all data?', eraseMsg: 'Every entry, category and budget will be deleted for good. Export a backup first.', eraseOk: 'Erase everything', erased: 'All data erased',
    impPrivacy: 'Files are read on this phone only and are never uploaded.', impFile: 'Choose file', impFileSub: 'CSV, Excel or PDF statement', impPaste: 'Paste text', impPasteSub: 'Copy the list from your online bank',
    impPastePh: 'Paste transactions copied from your online bank. Each needs a date and an amount', impRead: 'Read transactions', impReading: 'Reading…', impPasteEmpty: 'Paste some transactions first',
    icaHowTitle: 'Exporting from ICA Banken',
    icaHow1: 'Log in to ICA Banken’s internet bank in a computer browser (the app has no export).',
    icaHow2: 'Open “Konton”, pick the account, and export the transaction list as a CSV or Excel file.',
    icaHow3: 'No export button? Download a monthly PDF under “Dokument → Konton”, or select the transaction list on the page, copy it, and use Paste text.',
    icaHow4: 'Move the file to your phone with iCloud Drive or AirDrop, then choose it here.',
    impNothing: 'No transactions found. Open “Columns” to map them by hand, or paste text instead.', impOldXls: 'This is an old .xls file. Save it as .xlsx or CSV in Excel or Numbers, then import again.',
    impBadFile: 'This file can’t be read', impPdfFail: 'Couldn’t read the PDF. Try CSV or paste text', impPdfDemo: 'PDF import works in the installed app, not the preview',
    impPdfNoText: 'This PDF has no readable text (it may be a scan). Use CSV, Excel, or paste the list from your online bank.', impPdfNeedPw: 'This PDF is password-protected', impPdfWrongPw: 'Wrong password. Try again',
    impPdfPwTitle: 'PDF password', impPdfPwLead: 'This PDF is password-protected. The password is only used to open the file on this phone and isn’t saved.', impOpen: 'Open', impAllDup: 'Every transaction in this statement was imported before.',
    diagLead: 'This format info keeps only the file’s structure: every letter becomes a and every digit becomes 9, so it has no real amounts, dates or names. It’s safe to send to whoever is helping you.',
    diagCopy: 'Copy format info', diagCopied: 'Format info copied', diagSelect: 'Format info selected. Copy it manually', diagShow: 'Show contents', diagWrong: 'Something wrong? Copy format info',
    impFound: '{n} transactions', impRange: '{a} to {b}', impDup: '{n} were imported before and are skipped.', impUnchecked: '{n} transfers, pending or possibly already recorded entries are unchecked. Tick any you want.',
    impAllPositive: 'Every amount is positive. If this is a credit card statement, tap “Flip signs”.', impFlip: 'Flip signs', impAll: 'Select all', impNone: 'Select none', impCur: 'Statement currency',
    impMap: 'Columns', impMapSum: 'Date {d}, description {t}, amount {a}', impColDate: 'Date', impColText: 'Description', impColAmt: 'Amount', impColBal: 'Balance (optional)', impColNone: 'None',
    impGo: 'Import {n}', impDone: 'Imported {n}', impNoneSel: 'Select at least one', tagTransfer: 'Transfer', tagPending: 'Pending', tagMaybe: 'Maybe recorded',
    srcText: 'Pasted text', srcCSV: 'CSV table', srcExcel: 'Excel table', srcPDF: 'PDF statement',
    installTitle: 'Add to Home Screen', installText: 'In Safari, tap Share, then “Add to Home Screen”. Always open Tally from that icon: its data is kept apart from Safari’s.',
    nagTitle: 'Time for a backup', nagText: 'No backup for {n} days. If the Home Screen icon is deleted or you change phones, unsaved data goes with it.', nagNever: 'You haven’t backed up yet. If the Home Screen icon is deleted or you change phones, unsaved data goes with it.', backupNow: 'Back up now', later: 'Later',
    volatile: 'This browser can’t keep data (it may be in private mode). Entries will be lost when it closes.',
    demoBanner: 'Preview with sample data. It resets on reload, so don’t enter real entries.',
    demoNoFile: 'The preview can’t save or restore files. The installed app can',
    updateReady: 'A new version is ready', reload: 'Reload', offline: 'Offline',
    updateBanner: 'A new version is downloaded. Reload to start using it.',
    palette: 'Style', icon: 'Icon', pal_harbor: 'Harbor', pal_ledger: 'Ledger', pal_receipt: 'Receipt', pal_piggy: 'Piggy bank', pal_coin: 'Coins',
    iconHintApp: 'The Home Screen icon is fixed when you add the app. Using a new icon means adding Tally again.', iconHintSafari: 'Now tap Share → Add to Home Screen in Safari to use this icon.',
    iconSteps: 'How to change the icon', iconStepsTitle: 'Change the Home Screen icon', iconStep1: 'Export an encrypted backup here in Settings.', iconStep2: 'Open {url} in Safari and pick the icon in Settings.',
    iconStep3: 'Tap Share in Safari, then Add to Home Screen.', iconStep4: 'Open the new Tally icon and restore the backup with Restore from backup.', iconStep5: 'Once your entries are there, delete the old icon.',
    storeWhere: 'Where your data is', storeApp: 'Tally on your Home Screen', storeSafari: 'Safari web page', storeBrowser: 'This browser',
    storePersist: 'Kept long-term. The system won’t clear it on its own', storeNoPersist: 'Not kept long-term. It may be cleared when the phone runs low on space', storeUnknown: 'Stored only on this device',
    safariTitle: 'These entries are in Safari', safariText: 'Tally on your Home Screen can’t see entries saved here, and Safari may clear data for sites you haven’t visited in a while. Export an encrypted backup and restore it in the Home Screen app.', exportBackup: 'Export backup',
    nagNew: '{n} new entries since your last backup. If the Home Screen icon is deleted or you change phones, they go with it.',
    monthSummary: 'Month summary', moreActions: 'More',
  },
};
let LANG = 'zh';
function t(k, v) {
  let s = (v && v.n === 1 && STR[LANG][k + '_1']) || STR[LANG][k] || STR.zh[k] || k;
  if (v) s = s.replace(/\{(\w+)\}/g, (_, x) => (v[x] ?? ''));
  return s;
}

/* ───────────────────────── icons ───────────────────────── */

const ICONS = {
  utensils: '<path d="M7 3v18"/><path d="M4.5 3v5.5a2.5 2.5 0 0 0 5 0V3"/><path d="M17.5 21V3c-2.3 1.2-3.5 3.6-3.5 6.5V14h3.5"/>',
  cart: '<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/><path d="M3 4h2.4l2.3 10.6a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.2L20 8H6.2"/>',
  tram: '<rect x="5" y="4.5" width="14" height="12.5" rx="3"/><path d="M5 11h14M9.5 2.5h5M12 2.5v2"/><path d="M8.5 21l1.5-4M15.5 21 14 17"/><circle cx="8.7" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="15.3" cy="14" r=".9" fill="currentColor" stroke="none"/>',
  home: '<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6.5l-1 8 8.5-11h-6.5z"/>',
  bag: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V6.5a3 3 0 0 1 6 0v4"/>',
  ticket: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v2M14.5 11v2M14.5 15.5v2"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11.5V10a4 4 0 0 1 4-4h12"/><path d="M7 21l-3-3 3-3"/><path d="M20 12.5V14a4 4 0 0 1-4 4H4"/>',
  heart: '<path d="M12 20s-8.5-4.9-8.5-11a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 6.1-8.5 11-8.5 11z"/><path d="M12 9v6M9 12h6"/>',
  cap: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.3c1.5 1.4 3.4 2.2 5.5 2.2s4-.8 5.5-2.2v-4.3"/><path d="M21.5 9.5v5"/>',
  plane: '<path d="M12 2.8c.9 0 1.5.8 1.5 1.8v5.2l7.5 4.4v2l-7.5-2.2v4.3l2.2 1.6v1.7L12 20.6l-3.7 1v-1.7l2.2-1.6V14L3 16.2v-2l7.5-4.4V4.6c0-1 .6-1.8 1.5-1.8z"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5"/><path d="M12 8C10.7 4.6 7 4.6 7 6.4 7 8 10 8 12 8zm0 0c1.3-3.4 5-3.4 5-1.6C17 8 14 8 12 8z"/>',
  dots: '<circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  family: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.3"/><path d="M16 14.2a4.4 4.4 0 0 1 4.5 4.3"/>',
  medal: '<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.3 7.2 21l4.8-2.5 4.8 2.5-1.4-7.7"/>',
  laptop: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  envelope: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 8.5c2 1.6 4.4 2.5 7 2.5s5-.9 7-2.5"/><circle cx="12" cy="11.6" r="1.8"/>',
  undo: '<path d="M4 4.5v5h5"/><path d="M4.6 14a8 8 0 1 0 1.5-6.8L4 9.5"/>',
  coffee: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5"/>',
  paw: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14.5" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12.2 11.5c2.6 0 5.6 4.3 5.1 6.7-.4 1.8-2.4 2-5.1 1.1-2.7.9-4.7.7-5.1-1.1-.5-2.4 2.5-6.7 5.1-6.7z"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  car: '<path d="M4.5 13.5 6.4 8a1.6 1.6 0 0 1 1.5-1h8.2a1.6 1.6 0 0 1 1.5 1l1.9 5.5"/><rect x="3" y="13.5" width="18" height="4.5" rx="1.5"/><path d="M6.5 18v2M17.5 18v2"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.3" r="1" fill="currentColor" stroke="none"/>',
  music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  gamepad: '<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.4 3.6l.9 4.8a2.4 2.4 0 0 1-4.1 2.1L15 15.5H9l-2.7 2.5a2.4 2.4 0 0 1-4.1-2.1l.9-4.8a4.5 4.5 0 0 1 4.4-3.6z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".9" fill="currentColor" stroke="none"/><circle cx="17.3" cy="13" r=".9" fill="currentColor" stroke="none"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.8"/><circle cx="6.5" cy="17.5" r="2.8"/><path d="M8.8 8.3 20 18M8.8 15.7 20 6"/>',
  wrench: '<path d="M14.8 3.3a4.6 4.6 0 0 0-4.4 6.2l-6.6 6.6a2.1 2.1 0 0 0 3 3l6.6-6.6a4.6 4.6 0 0 0 6.2-4.4l-2.8 2.8-2.7-.5-.5-2.7z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15.5H6.5A1.5 1.5 0 0 0 5 20z"/><path d="M5 20a1.5 1.5 0 0 0 1.5 1.5H19"/>',
  shirt: '<path d="M8.5 3.5 4 6l1.8 4.2 2-.9v11.2h8.4V9.3l2 .9L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>',
  wine: '<path d="M7.5 3h9l-.5 5.5a4 4 0 0 1-8 0z"/><path d="M12 12.5v8M8.5 20.5h7"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9.5h6l3.5 7M9 9.5l3 7h-6.5M15 9.5 14 7h-2.5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/>',
  pill: '<rect x="2.6" y="8.2" width="18.8" height="7.6" rx="3.8" transform="rotate(-45 12 12)"/><path d="M8.6 8.6l6.8 6.8"/>',
  /* interface */
  receipt: '<path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  pie: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.8a8.5 8.5 0 0 1 5.2 5.2H15z"/>',
  gauge: '<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.5-5.5"/><circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5 16 16"/>',
  import: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 15v3.5A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2V15"/>',
  export: '<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8"/><path d="M4 15v3.5A2 2 0 0 0 6 20.5h12a2 2 0 0 0 2-2V15"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 13.5h9l1-13.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chevL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevDown: '<path d="M6 9.5l6 6 6-6"/>',
  backspace: '<path d="M8.5 5.5h11a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-11L3 12z"/><path d="M11 9.5l5 5M16 9.5l-5 5"/>',
  faceid: '<path d="M3.5 8V6a2.5 2.5 0 0 1 2.5-2.5h2M16 3.5h2A2.5 2.5 0 0 1 20.5 6v2M20.5 16v2a2.5 2.5 0 0 1-2.5 2.5h-2M8 20.5H6A2.5 2.5 0 0 1 3.5 18v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v3.5h-1"/><path d="M9 15.5a4.5 4.5 0 0 0 6 0"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5z"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  refresh: '<path d="M19.5 9.5A8 8 0 0 0 5.2 7.2L3.5 9"/><path d="M3.5 4v5h5"/><path d="M4.5 14.5a8 8 0 0 0 14.3 2.3l1.7-1.8"/><path d="M20.5 20v-5h-5"/>',
  tag: '<path d="M3.5 12.2V4.8a1.3 1.3 0 0 1 1.3-1.3h7.4l8.3 8.3a1.3 1.3 0 0 1 0 1.8l-7.4 7.4a1.3 1.3 0 0 1-1.8 0z"/><circle cx="8" cy="8" r="1.4"/>',
  archive: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5v10A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12h4"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  exchange: '<path d="M4 8h14.5l-3-3M20 16H5.5l3 3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shieldCheck: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  paste: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5v-1h6v1M9 10.5h6M9 14.5h4"/>',
  file: '<path d="M6.5 3h7.5l4.5 4.5V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M13.5 3v5h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.1-.6-1.2.2-2.4 1.5-2.4H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z"/><circle cx="7.6" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.4" cy="7.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.8" cy="7.8" r="1.2" fill="currentColor" stroke="none"/>',
  appicon: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M9 9v6M12 9v6M15 9v6"/>',
};
const CAT_ICONS = ['utensils', 'cart', 'tram', 'home', 'bolt', 'bag', 'ticket', 'repeat', 'heart', 'cap', 'plane', 'gift', 'coffee', 'wine', 'shirt', 'car', 'bike', 'phone', 'wifi', 'music', 'gamepad', 'book', 'paw', 'dumbbell', 'pill', 'scissors', 'wrench', 'shield', 'star', 'briefcase', 'family', 'medal', 'laptop', 'trend', 'envelope', 'undo', 'dots'];
const ic = (name, cls = '') => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dots}</svg>`);

/* ───────────────────────── categories & keywords ───────────────────────── */

const PALETTE = ['#E8823A', '#D8A31A', '#9AAE2E', '#2FA46F', '#1E9E92', '#2F92D0', '#4C6FD8', '#7E62D6', '#A657C6', '#D9559A', '#D9475A', '#A26B3F', '#8B969B'];
const DEFAULT_CATS = [
  ['e_food', 'expense', 'food', 'utensils', '#E8823A'],
  ['e_groceries', 'expense', 'groceries', 'cart', '#2FA46F'],
  ['e_transport', 'expense', 'transport', 'tram', '#2F92D0'],
  ['e_housing', 'expense', 'housing', 'home', '#7E62D6'],
  ['e_utilities', 'expense', 'utilities', 'bolt', '#D8A31A'],
  ['e_shopping', 'expense', 'shopping', 'bag', '#D9559A'],
  ['e_fun', 'expense', 'fun', 'ticket', '#A657C6'],
  ['e_subs', 'expense', 'subs', 'repeat', '#4C6FD8'],
  ['e_health', 'expense', 'health', 'heart', '#1E9E92'],
  ['e_study', 'expense', 'study', 'cap', '#A26B3F'],
  ['e_travel', 'expense', 'travel', 'plane', '#9AAE2E'],
  ['e_gifts', 'expense', 'gifts', 'gift', '#D9475A'],
  ['e_other', 'expense', 'other', 'dots', '#8B969B'],
  ['i_salary', 'income', 'salary', 'briefcase', '#2FA46F'],
  ['i_allowance', 'income', 'allowance', 'family', '#E8823A'],
  ['i_grant', 'income', 'grant', 'medal', '#4C6FD8'],
  ['i_parttime', 'income', 'parttime', 'laptop', '#1E9E92'],
  ['i_invest', 'income', 'invest', 'trend', '#7E62D6'],
  ['i_gift', 'income', 'giftIn', 'envelope', '#D9475A'],
  ['i_refund', 'income', 'refund', 'undo', '#D8A31A'],
  ['i_other', 'income', 'otherIn', 'dots', '#8B969B'],
].map(([id, type, key, icon, color], order) => ({ id, type, key, icon, color, order }));
const OTHER = { expense: 'e_other', income: 'i_other' };

const KEYWORDS = {
  expense: [
    ['groceries', 'ica,coop,willys,hemköp,hemkop,lidl,city gross,citygross,netto,tempo,matöppet,matoppet,mathem,mat.se,livsmedel,dagligvaror,asia market,asian market,orientlivs,supermarket,超市'],
    ['food', 'restaurang,restaurant,café,cafe,kafé,kafe,espresso house,wayne,starbucks,pressbyrån,pressbyran,7-eleven,7 eleven,mcdonalds,mcdonald,max burgers,burger king,subway,pizza,pizzeria,sushi,kebab,foodora,wolt,uber eats,ubereats,bistro,pub,kårrestaurang,karrestaurang,lunch,餐厅,外卖'],
    ['transport', 'västtrafik,vasttrafik,sj,sj.se,skånetrafiken,sl,taxi,uber,bolt.eu,voi,tier,lime,circle k,preem,okq8,st1,ingo,parkering,easypark,flixbus,vy,mtrx,öresundståg,styr & ställ,bensin,drivmedel,transport,resor,滴滴,地铁'],
    ['housing', 'hyra,sgs,studentbostäder,studentbostader,boplats,bostad,hsb,riksbyggen,wallenstam,heimstaden,akelius,poseidon,bostadsbolag,hemförsäkring,hemforsakring,boende,房租'],
    ['utilities', 'telia,tele2,telenor,tre,hallon,comviq,vimla,fello,göteborg energi,goteborg energi,vattenfall,tibber,fortum,ellevio,bredband,bahnhof,com hem,elavtal,话费,电费'],
    ['subs', 'spotify,netflix,hbo,disney,viaplay,youtube,apple.com,itunes,icloud,google one,chatgpt,openai,anthropic,claude.ai,microsoft,adobe,patreon,storytel,nextory,audible,dropbox,notion,github'],
    ['health', 'apotek,apoteket,kronans,hjärtat,hjartat,vårdcentral,vardcentral,tandläkare,tandlakare,folktandvården,folktandvarden,1177,sjukhus,optiker,synsam,specsavers,sats,friskis,nordic wellness,actic,gym,hälsa,halsa,医院,药'],
    ['study', 'chalmers,studentkår,studentkar,cremona,adlibris,bokus,akademibokhandel,coursera,udemy,kurslitteratur,utbildning,学费'],
    ['shopping', 'h&m,hm.com,zara,clas ohlson,ikea,jula,biltema,elgiganten,mediamarkt,media markt,netonnet,webhallen,inet,komplett,amazon,lindex,kappahl,åhléns,ahlens,rusta,normal,dollarstore,temu,shein,zalando,cdon,xxl,stadium,intersport,kicks,lyko,granit,flying tiger,uniqlo,arket,lagerhaus,kläder,shopping,淘宝,京东,拼多多,天猫'],
    ['fun', 'filmstaden,sf bio,biograf,steam,playstation,nintendo,xbox,bowling,liseberg,konsert,ticketmaster,tickster,systembolaget,museum,universeum,nöje,noje'],
    ['travel', 'sas,norwegian,ryanair,wizz,finnair,klm,lufthansa,air china,flygbussarna,hotel,hotell,airbnb,booking.com,expedia,ving,apollo,tui,trip.com,ctrip,hostel,scandic,携程,机票,酒店'],
    ['gifts', 'interflora,blomster,florist,present,gåva,礼物'],
  ],
  income: [
    ['salary', 'lön,salary,payroll,工资'],
    ['grant', 'csn,stipend,stipendium,scholarship,奖学金'],
    ['refund', 'återbetalning,aterbetalning,återköp,aterkop,retur,refund,kreditering,skatteverket,skatteåterbäring,退款'],
    ['invest', 'ränta,ranta,utdelning,dividend,interest,avanza,nordnet,利息'],
    ['allowance', '生活费'],
  ],
};
const CJK = /[\u3400-\u9fff]/;
const kwRegex = list => new RegExp(list.split(',').map(w => w.trim()).filter(Boolean)
  .map(w => (CJK.test(w) ? escRe(w) : `(?<![\\p{L}\\p{N}])${escRe(w)}(?![\\p{L}\\p{N}])`)).join('|'), 'iu');
const KW_RE = Object.fromEntries(Object.entries(KEYWORDS).map(([type, rows]) => [type, rows.map(([key, list]) => [key, kwRegex(list)])]));
const TRANSFER_RE = /(?<![\p{L}])(över|over)föring|overforing|internöverföring|egen överf|sparkonto|own account|transfer (to|from)/iu;
const PENDING_RE = /reserv|preliminär|prelim|pending|väntande|ej bokförd/i;
const SUMMARY_LINE_RE = /^(ingående|utgående|saldo|summa|totalt|total|opening|closing|balance|期初|期末|余额|合计)/i;

/* ───────────────────────── state ───────────────────────── */

const DEFAULT_SETTINGS = {
  lang: 'system', theme: 'system', palette: 'harbor', icon: null, display: 'SEK', lastBackup: null, backupCount: 0, hideInstall: false, nagAt: 0, safariNagAt: 0,
  lock: { on: false, credId: null, pinHash: null, pinSalt: null, delay: 60, fails: 0, until: 0 },
};
const S = {
  locked: false, tab: 'home', month: monthOf(todayStr()), statsYear: new Date().getFullYear(),
  stats: { mode: 'month', type: 'expense' }, search: '', searchOpen: false, scroll: {},
  tx: [], cats: [], settings: structuredClone(DEFAULT_SETTINGS), budget: { total: null, cats: {} }, rules: {},
  rates: { latest: null, hist: {} }, lastCat: {}, recentCur: [], volatile: false,
  lockUI: { mode: 'face', entered: '', msg: '' }, hiddenAt: 0, extUntil: 0, imp: null,
};
let F = null; // the entry form currently open

/* ───────────────────────── storage ───────────────────────── */

const db = {
  h: null, mem: null,
  async open() {
    if (DEMO || !('indexedDB' in window)) { this.mem = { tx: new Map(), kv: new Map() }; if (!DEMO) S.volatile = true; return; }
    try {
      this.h = await new Promise((res, rej) => {
        const r = indexedDB.open('tally', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('tx')) d.createObjectStore('tx', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      });
    } catch (e) {
      console.warn('IndexedDB unavailable', e);
      this.mem = { tx: new Map(), kv: new Map() }; S.volatile = true;
    }
  },
  run(store, mode, fn) {
    return new Promise((res, rej) => {
      const tr = this.h.transaction(store, mode);
      let result;
      const r = fn(tr.objectStore(store));
      if (r) r.onsuccess = () => { result = r.result; };
      tr.oncomplete = () => res(result);
      tr.onerror = () => rej(tr.error);
      tr.onabort = () => rej(tr.error);
    });
  },
  async all() { return this.mem ? [...this.mem.tx.values()].map(x => ({ ...x })) : this.run('tx', 'readonly', st => st.getAll()); },
  async put(x) { if (this.mem) { this.mem.tx.set(x.id, { ...x }); return; } return this.run('tx', 'readwrite', st => st.put(x)); },
  async putMany(list) { if (this.mem) { list.forEach(x => this.mem.tx.set(x.id, { ...x })); return; } return this.run('tx', 'readwrite', st => { list.forEach(x => st.put(x)); }); },
  async del(id) { if (this.mem) { this.mem.tx.delete(id); return; } return this.run('tx', 'readwrite', st => st.delete(id)); },
  async clear() { if (this.mem) { this.mem.tx.clear(); return; } return this.run('tx', 'readwrite', st => st.clear()); },
  async get(k) { if (this.mem) { const v = this.mem.kv.get(k); return v === undefined ? undefined : structuredClone(v); } return this.run('kv', 'readonly', st => st.get(k)); },
  async set(k, v) { if (this.mem) { this.mem.kv.set(k, structuredClone(v)); return; } return this.run('kv', 'readwrite', st => st.put(v, k)); },
};
const saveSettings = () => db.set('settings', S.settings);
const sortTx = () => S.tx.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0)));

async function loadData() {
  const [tx, cats, budget, rules, rates, lastCat, recentCur] = await Promise.all(
    ['tx', 'cats', 'budget', 'rules', 'rates', 'lastCat', 'recentCur'].map(k => (k === 'tx' ? db.all() : db.get(k))));
  S.tx = tx || [];
  S.cats = cats?.length ? cats : DEFAULT_CATS.map(c => ({ ...c }));
  if (!cats?.length) await db.set('cats', S.cats);
  S.budget = budget || { total: null, cats: {} };
  S.rules = rules || {};
  S.rates = rates || { latest: null, hist: {} };
  S.lastCat = lastCat || {};
  S.recentCur = recentCur || [];
  sortTx();
}

/* ───────────────────────── formatting ───────────────────────── */

const CUR_INFO = {
  SEK: { sym: 'kr', after: true }, CNY: { sym: '¥' }, EUR: { sym: '€' }, USD: { sym: '$' }, GBP: { sym: '£' },
  JPY: { sym: 'JP¥', dp: 0 }, HKD: { sym: 'HK$' }, KRW: { sym: '₩', dp: 0 }, ISK: { sym: 'ISK ', dp: 0 }, TWD: { sym: 'NT$' },
  VND: { sym: '₫', dp: 0 }, IDR: { sym: 'Rp ', dp: 0 }, THB: { sym: '฿' }, INR: { sym: '₹' },
};
const CUR_CC = { SEK: 'SE', CNY: 'CN', EUR: 'EU', USD: 'US', GBP: 'GB', NOK: 'NO', DKK: 'DK', JPY: 'JP', HKD: 'HK', KRW: 'KR', CHF: 'CH', THB: 'TH', SGD: 'SG', AUD: 'AU', CAD: 'CA', PLN: 'PL', ISK: 'IS', TRY: 'TR', CZK: 'CZ', HUF: 'HU', NZD: 'NZ', MYR: 'MY', TWD: 'TW', INR: 'IN', IDR: 'ID', PHP: 'PH', VND: 'VN', AED: 'AE', MXN: 'MX', BRL: 'BR', ZAR: 'ZA', ILS: 'IL', RON: 'RO', BGN: 'BG', MOP: 'MO' };
const COMMON_CUR = ['SEK', 'CNY', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'JPY', 'HKD', 'KRW', 'CHF', 'THB', 'SGD', 'AUD', 'CAD', 'PLN', 'ISK', 'TRY', 'CZK', 'HUF', 'NZD', 'MYR', 'TWD', 'INR', 'IDR', 'PHP', 'VND', 'AED'];
const dpOf = c => CUR_INFO[c]?.dp ?? 2;
const flag = c => { const cc = CUR_CC[c] || (/^[A-W]/.test(c) ? c.slice(0, 2) : null); return cc ? String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '•'; };
const nfCache = {};
const numFmt = (dp, opts = {}) => { const k = LANG + dp + JSON.stringify(opts); return (nfCache[k] ||= new Intl.NumberFormat(t('locale'), { minimumFractionDigits: dp, maximumFractionDigits: dp, ...opts })); };
const fmtNum = (n, dp = 2) => numFmt(dp).format(n);
const fmtCompact = n => numFmt(0, { notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(n);
const MINUS = '−';
function fmtMoney(n, cur = BASE, sign = '') {
  const abs = fmtNum(Math.abs(n), dpOf(cur));
  const info = CUR_INFO[cur];
  if (!info) return `${sign}${cur} ${abs}`;
  return info.after ? `${sign}${abs} ${info.sym}` : `${sign}${info.sym}${abs}`;
}
// Everything is booked in SEK; totals can be shown in another currency at the latest rate.
const dispCur = () => { const c = S.settings?.display; return c && c !== BASE && S.rates.latest?.rates?.[c] > 0 ? c : BASE; };
const toDisp = sek => { const c = dispCur(); return c === BASE ? sek : sek / S.rates.latest.rates[c]; };
const fmtD = (sek, sign = '') => fmtMoney(toDisp(sek), dispCur(), sign);
const fmtDN = (sek, dp) => fmtNum(toDisp(sek), dp ?? dpOf(dispCur()));
const unitOf = c => (c === 'SEK' ? 'kr' : c === 'CNY' ? t('unitCNY') : c);
const moneyParts = n => { const s = fmtNum(Math.abs(n)); const i = s.lastIndexOf('.'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)]; };
const fmtRate = r => (r >= 0.01 ? String(+r.toFixed(4)) : String(+r.toPrecision(3)));
let dnCache = {};
function curName(code) {
  try { return ((dnCache[LANG] ||= new Intl.DisplayNames([LANG === 'zh' ? 'zh-Hans' : 'en'], { type: 'currency' })).of(code)) || code; } catch { return code; }
}
const WEEK_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtMonth(ym) { const [y, m] = ym.split('-').map(Number); return LANG === 'zh' ? `${y}年${m}月` : new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
function fmtMonthName(ym) { const [y, m] = ym.split('-').map(Number); return LANG === 'zh' ? `${m}月` : new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' }); }
function fmtDate(s, withWeek = false) {
  const d = parseYmd(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  let r = LANG === 'zh'
    ? `${sameYear ? '' : d.getFullYear() + '年'}${d.getMonth() + 1}月${d.getDate()}日`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  if (withWeek) r = LANG === 'zh' ? `${r} ${WEEK_ZH[d.getDay()]}` : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${r}`;
  return r;
}
function fmtDay(s) { const td0 = todayStr(); if (s === td0) return t('today'); if (s === addDays(td0, -1)) return t('yesterday'); return fmtDate(s, true); }
function fmtDayShort(s) { const td0 = todayStr(); if (s === td0) return t('today'); if (s === addDays(td0, -1)) return t('yesterday'); return fmtDate(s); }

/* ───────────────────────── derived data ───────────────────────── */

const catById = id => S.cats.find(c => c.id === id) || S.cats.find(c => c.id === 'e_other') || DEFAULT_CATS[12];
const catName = c => c.name || (c.key && STR.zh['cat_' + c.key] ? t('cat_' + c.key) : '—');
const catsOf = type => S.cats.filter(c => c.type === type).sort((a, b) => a.order - b.order);
function sums(list) { let e = 0, i = 0; for (const x of list) { if (x.type === 'expense') e += x.base; else i += x.base; } return { e: round2(e), i: round2(i) }; }
const txBetween = (a, b) => S.tx.filter(x => x.date >= a && x.date <= b);
const sumType = (type, a, b, cat) => round2(S.tx.reduce((s, x) => s + (x.type === type && x.date >= a && x.date <= b && (!cat || x.cat === cat) ? x.base : 0), 0));
function groupByDate(list) { const m = new Map(); for (const x of list) { let g = m.get(x.date); if (!g) m.set(x.date, (g = [])); g.push(x); } return [...m].map(([date, items]) => ({ date, items })); }
function budgetStatus(ym, catId) {
  const total = catId ? S.budget.cats[catId] : S.budget.total;
  if (!(total > 0)) return null;
  const [a, b] = monthRange(ym);
  const spent = sumType('expense', a, b, catId);
  const left = round2(total - spent);
  const pct = spent / total;
  const td0 = todayStr(); let daysLeft = 0;
  if (ym === monthOf(td0)) daysLeft = daysIn(ym) - Number(td0.slice(8)) + 1; else if (ym > monthOf(td0)) daysLeft = daysIn(ym);
  return { total, spent, left, pct, daysLeft, perDay: daysLeft > 0 && left > 0 ? left / daysLeft : 0, level: pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok' };
}

/* ───────────────────────── guilloche art ───────────────────────── */

function rosettePaths(cx, cy, R, bands) {
  const paths = [];
  for (const [base, amp, freq, layers, wob = 0] of bands) {
    const steps = Math.max(120, freq * 12);
    for (let k = 0; k < layers; k++) {
      const ph = (k / layers) * Math.PI * 2;
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const r = R * (base + amp * Math.sin(freq * a + ph) + wob * Math.sin(3 * a - ph));
        d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
      }
      paths.push(d + 'Z');
    }
  }
  return paths;
}
const NOTE_BANDS = [[0.88, 0.05, 30, 9], [0.66, 0.13, 15, 12, 0.012], [0.4, 0.09, 10, 9], [0.18, 0.05, 6, 6]];
function noteArtURL() {
  const p = rosettePaths(200, 200, 192, NOTE_BANDS);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><g fill="none" stroke="#fff" stroke-opacity=".17" stroke-width=".8">${p.map(d => `<path d="${d}"/>`).join('')}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const PALETTES = ['harbor', 'ledger', 'receipt', 'piggy', 'coin'];
const MARKS = {
  ledger: '<g stroke-width="5" stroke-linecap="round"><path d="M30 24v52M43 24v52M56 24v52M69 24v52"/><path d="M19 68 81 32"/></g>',
  receipt: '<g stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><path d="M28 12h44v76l-7.33-5-7.33 5-7.34-5-7.33 5-7.34-5-7.33 5z"/><path d="M38 30h24M38 42h24M38 54h14M38 68h24"/></g>',
  piggy: '<g stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="47" cy="57" rx="29" ry="21"/><path d="M31 41l3-12 10 8"/><ellipse cx="78" cy="57" rx="6.5" ry="8"/><path d="M34 76v8M58 76v8M18 52c-6-1-7 6-2 7M42 37h11"/><circle cx="48" cy="17" r="7"/></g><circle cx="64" cy="51" r="2.4" fill="currentColor"/>',
  coin: '<g stroke-width="4" stroke-linejoin="round"><ellipse cx="50" cy="28" rx="26" ry="8"/><path d="M24 28v11c0 4.4 11.6 8 26 8s26-3.6 26-8V28M24 42v11c0 4.4 11.6 8 26 8s26-3.6 26-8V42M24 56v11c0 4.4 11.6 8 26 8s26-3.6 26-8V56"/></g>',
};
// The small drawing used on empty screens, the lock screen and About follows the chosen style.
function themeMark(cls = '') {
  const p = S.settings?.palette;
  if (!MARKS[p]) return rosetteMark(cls);
  return raw(`<svg class="mark ${cls}" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor">${MARKS[p]}</g></svg>`);
}
let markCache = null;
function rosetteMark(cls = '') {
  markCache ||= rosettePaths(50, 50, 46, [[0.8, 0.12, 12, 7], [0.42, 0.13, 7, 6]]).map(d => `<path d="${d}"/>`).join('');
  return raw(`<svg class="mark ${cls}" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1">${markCache}</g></svg>`);
}

/* ───────────────────────── charts ───────────────────────── */

function donutHTML(items, total, centerLabel) {
  const SZ = 220, sw = 24, r = (SZ - sw) / 2, C = 2 * Math.PI * r, c0 = SZ / 2;
  const gap = items.length > 1 ? 2.5 : 0;
  let off = 0;
  const segs = items.map(({ c, v }) => {
    const len = (v / total) * C;
    const d = Math.max(len - gap, 0.8);
    const s = `<circle cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke="${c.color}" stroke-width="${sw}" stroke-dasharray="${d.toFixed(2)} ${(C - d).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    off += len;
    return s;
  }).join('');
  const [int] = moneyParts(toDisp(total));
  return raw(`<svg class="donut" viewBox="0 0 ${SZ} ${SZ}" role="img" aria-label="${esc(centerLabel)} ${esc(fmtD(total))}">
    <g transform="rotate(-90 ${c0} ${c0})"><circle class="donut-track" cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke-width="${sw}"/>${segs}</g>
    <text x="${c0}" y="${c0 - 12}" class="donut-k" text-anchor="middle">${esc(centerLabel)}</text>
    <text x="${c0}" y="${c0 + 22}" class="donut-v" text-anchor="middle">${esc(int)}<tspan class="donut-u" dx="4">${esc(unitOf(dispCur()))}</tspan></text></svg>`);
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function barsHTML(series, avg, hiIndex) {
  const W = 340, H = 170, pl = 34, pr = 4, pt = 12, pb = 22;
  const max = niceMax(Math.max(...series.map(s => s.v), avg || 0, 1));
  const n = series.length, cw = (W - pl - pr) / n, bw = Math.max(3, Math.min(22, cw * 0.62));
  const y = v => pt + (H - pt - pb) * (1 - v / max);
  let g = '';
  for (const f of [0, 0.5, 1]) {
    const yy = y(max * f).toFixed(1);
    g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}"/><text class="axis" x="${pl - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end">${esc(fmtCompact(max * f))}</text>`;
  }
  series.forEach((s, i) => {
    const x = pl + cw * i + (cw - bw) / 2, h = Math.max(s.v > 0 ? 1.5 : 0, H - pb - y(s.v));
    const tip = `${s.tip}  ${fmtMoney(s.v, dispCur())}`;
    g += `<g class="bar ${i === hiIndex ? 'hi' : ''}" data-act="bar" data-tip="${esc(tip)}"><rect class="hit" x="${(pl + cw * i).toFixed(1)}" y="${pt}" width="${cw.toFixed(1)}" height="${H - pt}"/>`
      + `<rect class="col" x="${x.toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, bw / 2).toFixed(1)}"/></g>`;
    if (s.label && (n <= 12 || i === 0 || (i + 1) % 5 === 0))
      g += `<text class="axis" x="${(pl + cw * i + cw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(s.label)}</text>`;
  });
  if (avg > 0) { const ya = y(avg).toFixed(1); g += `<line class="avg" x1="${pl}" x2="${W - pr}" y1="${ya}" y2="${ya}"/>`; }
  return raw(`<svg class="bars" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`);
}
function ringHTML(b) {
  const SZ = 168, sw = 13, r = (SZ - sw) / 2, C = 2 * Math.PI * r, c0 = SZ / 2;
  const p = Math.min(b.pct, 1);
  const pctTxt = Math.round(b.pct * 100) + '%';
  return raw(`<svg class="ring ${b.level}" viewBox="0 0 ${SZ} ${SZ}" role="img" aria-label="${esc(pctTxt)} ${esc(t('used'))}">
    <circle class="ring-track" cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke-width="${sw}"/>
    ${p > 0 ? `<circle class="ring-val" cx="${c0}" cy="${c0}" r="${r}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(p * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${c0} ${c0})"/>` : ''}
    <text x="${c0}" y="${c0 + 6}" class="ring-v" text-anchor="middle">${esc(pctTxt)}</text>
    <text x="${c0}" y="${c0 + 28}" class="ring-k" text-anchor="middle">${esc(t('used'))}</text></svg>`);
}

/* ───────────────────────── small components ───────────────────────── */

const tileHTML = (c, cls = '') => html`<span class="tile ${cls}" style="--c:${c.color}">${ic(c.icon)}</span>`;
const segmented = (act, val, opts, cls = '') => html`<div class="seg ${cls}" role="tablist">${opts.map(([v, l]) => html`<button role="tab" aria-selected="${v === val ? 'true' : 'false'}" class="${v === val ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`)}</div>`;
const pinDots = n => html`<div class="pin-dots" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map(i => html`<i class="${i < n ? 'on' : ''}"></i>`)}</div>`;
const pinPadHTML = act => html`<div class="pinpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => (k === ''
  ? html`<span></span>`
  : html`<button data-act="${act}" data-k="${k}" aria-label="${k === 'del' ? t('delete') : k}">${k === 'del' ? ic('backspace') : k}</button>`))}</div>`;

/* ───────────────────────── app shell ───────────────────────── */

function renderApp() {
  if (S.locked) return;
  $('#app').innerHTML = html`<div class="view" id="view" data-tab="${S.tab}">${viewHTML()}</div>${tabbarHTML()}`.s;
  const v = $('#view');
  v.addEventListener('scroll', () => v.classList.toggle('scrolled', v.scrollTop > 6), { passive: true });
  v.scrollTop = S.scroll[S.tab] || 0;
}
function renderView(keep = true) {
  const v = $('#view');
  if (!v) return renderApp();
  const top = v.scrollTop;
  v.dataset.tab = S.tab;
  v.innerHTML = viewHTML().s;
  v.scrollTop = keep ? top : (S.scroll[S.tab] || 0);
  $$('.tabbar [data-tab]').forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
}
function refreshAll() { if (S.locked) return; renderView(); sheets.forEach(s => s.refresh?.()); }
function viewHTML() {
  if (S.tab === 'stats') return statsView();
  if (S.tab === 'budget') return budgetView();
  if (S.tab === 'settings') return settingsView();
  return homeView();
}
function tabbarHTML() {
  const tab = (id, icon, label) => html`<button class="tab ${S.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" aria-current="${S.tab === id ? 'page' : 'false'}">${ic(icon)}<span>${label}</span></button>`;
  return html`<nav class="tabbar" aria-label="${t('appName')}">
    ${tab('home', 'receipt', t('tabHome'))}${tab('stats', 'pie', t('tabStats'))}
    <button class="tab-add" data-act="add" aria-label="${t('add')}">${ic('plus')}</button>
    ${tab('budget', 'gauge', t('tabBudget'))}${tab('settings', 'sliders', t('tabSettings'))}</nav>`;
}
function heroHTML({ kicker, title, titleHTML, right }) {
  return html`<header class="hero"><div class="hero-row"><span class="kicker">${kicker || ''}</span><div class="hero-actions">${right || ''}</div></div>
    <div class="hero-title">${titleHTML || html`<h1>${title}</h1>`}</div></header>`;
}
function monthStepper() {
  return html`<div class="stepper"><button class="icon-btn" data-act="month-step" data-d="-1" aria-label="${t('prevMonth')}">${ic('chevL')}</button><button class="icon-btn" data-act="month-step" data-d="1" aria-label="${t('nextMonth')}">${ic('chevR')}</button></div>`;
}
function monthTitleHTML() {
  return html`<label class="month-pick"><h1>${fmtMonthName(S.month)}</h1>${ic('chevDown', 'sm')}<input type="month" value="${S.month}" data-change="month-pick" aria-label="${t('pickMonth')}"></label>${monthStepper()}`;
}

/* ── home ── */

function homeView() {
  return html`${heroHTML({
    kicker: S.month.slice(0, 4),
    titleHTML: monthTitleHTML(),
    right: html`<button class="icon-btn ${S.searchOpen ? 'on' : ''}" data-act="search-toggle" aria-label="${t('search')}">${ic('search')}</button><button class="icon-btn" data-act="import-open" aria-label="${t('importTitle')}">${ic('import')}</button>`,
  })}
  ${S.searchOpen ? html`<div class="search"><span class="search-ic">${ic('search')}</span><input id="search-in" type="search" placeholder="${t('searchPh')}" value="${S.search}" data-input="search" enterkeyhint="search" autocomplete="off" spellcheck="false"><button class="icon-btn sm" data-act="search-toggle" aria-label="${t('closeSearch')}">${ic('x')}</button></div>` : ''}
  <div id="home-body">${homeBody()}</div>`;
}
function homeBody() {
  const q = S.search.trim().toLowerCase();
  if (S.searchOpen && q) {
    const list = S.tx.filter(x => matchTx(x, q));
    const s = sums(list);
    return html`<p class="search-sum">${t('searchCount', { n: list.length })}${s.e ? html`<span class="num">${MINUS}${fmtD(s.e)}</span>` : ''}${s.i ? html`<span class="num in">+${fmtD(s.i)}</span>` : ''}</p>
      ${list.length ? groupByDate(list).map(dayGroupHTML) : html`<p class="empty-line">${t('noResults')}</p>`}`;
  }
  const [a, b] = monthRange(S.month);
  const list = txBetween(a, b);
  return html`${bannersHTML()}${noteCardHTML(sums(list), list.length)}
    ${list.length ? groupByDate(list).map(dayGroupHTML) : emptyHomeHTML()}`;
}
function matchTx(x, q) {
  const c = catById(x.cat);
  return (x.note || '').toLowerCase().includes(q) || catName(c).toLowerCase().includes(q)
    || String(x.amount).includes(q) || fmtNum(x.base).includes(q) || x.currency.toLowerCase() === q;
}
function noteCardHTML(sum, count) {
  const [int, dec] = moneyParts(toDisp(sum.e));
  const net = round2(sum.i - sum.e);
  const dc = dispCur();
  const b = budgetStatus(S.month);
  const isNow = S.month === monthOf(todayStr());
  return html`<div class="note-wrap"><section class="note" aria-label="${t('monthSummary')}">
    <div class="note-top"><span class="note-label">${isNow ? t('spent') : t('spentIn', { m: fmtMonthName(S.month) })}</span>
      <button class="note-cur" data-act="disp-open" aria-label="${t('dispCur')}"><span class="flag">${flag(dc)}</span>${dc}${ic('chevDown', 'xs')}</button></div>
    <div class="note-amt num"><span>${int}</span><span class="dec">${dec}</span><span class="cur">${unitOf(dc)}</span></div>
    <dl class="note-row">
      <div><dt>${t('income')}</dt><dd class="num">${fmtDN(sum.i)}</dd></div>
      <div><dt>${t('net')}</dt><dd class="num">${net < 0 ? MINUS : ''}${fmtDN(Math.abs(net))}</dd></div>
      <div><dt>${t('count')}</dt><dd class="num">${count}</dd></div>
    </dl>
    ${b ? html`<button class="note-budget ${b.level}" data-act="tab" data-tab="budget">
        <span class="note-bar"><i style="width:${Math.min(100, b.pct * 100).toFixed(1)}%"></i></span>
        <span class="note-bl"><span>${b.left >= 0 ? t('budgetLeft', { v: fmtD(b.left) }) : t('budgetOver', { v: fmtD(-b.left) })}</span>${b.perDay > 0 ? html`<span>${t('perDay', { v: fmtD(b.perDay) })}</span>` : ''}</span>
      </button>` : ''}
  </section></div>`;
}
function bannersHTML() {
  const out = [];
  if (S.updateReady) out.push(html`<div class="banner"><span class="banner-ic">${ic('refresh')}</span><div><b>${t('updateReady')}</b><p>${t('updateBanner')}</p>
    <div class="banner-btns"><button class="btn small" data-act="reload-app">${t('reload')}</button></div></div></div>`);
  if (DEMO) out.push(html`<div class="banner"><span class="banner-ic">${ic('info')}</span><p>${t('demoBanner')}</p></div>`);
  if (S.volatile) out.push(html`<div class="banner warn"><span class="banner-ic">${ic('info')}</span><p>${t('volatile')}</p></div>`);
  const safari = !DEMO && isIOS && !isStandalone();
  if (safari && S.tx.length && Date.now() - (S.settings.safariNagAt || 0) > 3 * 864e5)
    out.push(html`<div class="banner warn"><span class="banner-ic">${ic('info')}</span><div><b>${t('safariTitle')}</b><p>${t('safariText')}</p>
      <div class="banner-btns"><button class="btn small" data-act="backup-export">${t('exportBackup')}</button><button class="btn small ghost" data-act="safari-later">${t('later')}</button></div></div></div>`);
  else if (safari && !S.settings.hideInstall) out.push(html`<div class="banner"><span class="banner-ic">${ic('export')}</span><div><b>${t('installTitle')}</b><p>${t('installText')}</p></div><button class="icon-btn sm" data-act="hide-install" aria-label="${t('close')}">${ic('x')}</button></div>`);
  const last = S.settings.lastBackup, days = last ? Math.floor((Date.now() - last) / 864e5) : null;
  const fresh = S.tx.length - (S.settings.backupCount || 0);
  if (!DEMO && !safari && S.tx.length >= 10 && (days == null || days >= 14 || fresh >= 40) && Date.now() - (S.settings.nagAt || 0) > 3 * 864e5)
    out.push(html`<div class="banner"><span class="banner-ic">${ic('archive')}</span><div><b>${t('nagTitle')}</b><p>${days == null ? t('nagNever') : days >= 14 ? t('nagText', { n: days }) : t('nagNew', { n: fresh })}</p>
      <div class="banner-btns"><button class="btn small" data-act="backup-export">${t('backupNow')}</button><button class="btn small ghost" data-act="nag-later">${t('later')}</button></div></div></div>`);
  return out;
}
function emptyHomeHTML() {
  return html`<div class="empty">${themeMark()}<p class="empty-title">${t('emptyTitle')}</p><p class="empty-sub">${t('emptySub')}</p>
    <div class="empty-btns"><button class="btn primary" data-act="add">${ic('plus')}<span>${t('addFirst')}</span></button><button class="btn ghost" data-act="import-open">${ic('import')}<span>${t('importTitle')}</span></button></div></div>`;
}
function dayGroupHTML(g) {
  const s = sums(g.items);
  return html`<section class="day"><h3 class="day-head"><span>${fmtDay(g.date)}</span><span class="day-sum num">${s.e ? `${t('expense')} ${fmtDN(s.e)}` : ''}${s.e && s.i ? '　' : ''}${s.i ? `${t('income')} ${fmtDN(s.i)}` : ''}</span></h3>
    <ul class="rows">${g.items.map(rowHTML)}</ul></section>`;
}
function rowHTML(x) {
  const c = catById(x.cat);
  const sign = x.type === 'expense' ? MINUS : '+';
  const disp = dispCur(), same = x.currency === disp;
  return html`<li><button class="row" data-act="tx-edit" data-id="${x.id}">${tileHTML(c)}
    <span class="row-main"><span class="row-title">${x.note || catName(c)}</span>${x.note ? html`<span class="row-sub">${catName(c)}</span>` : ''}</span>
    <span class="row-amt ${x.type === 'income' ? 'in' : ''}"><span class="num">${same ? sign + fmtNum(x.amount, dpOf(x.currency)) : fmtMoney(x.amount, x.currency, sign)}</span>${same ? '' : html`<span class="amt-sub num">${fmtD(x.base, sign)}</span>`}</span>
  </button></li>`;
}

/* ── stats ── */

function statsRange() {
  if (S.stats.mode === 'year') { const y = S.statsYear; return [`${y}-01-01`, `${y}-12-31`, `${y - 1}-01-01`, `${y - 1}-12-31`]; }
  const [a, b] = monthRange(S.month), [pa, pb] = monthRange(addMonths(S.month, -1));
  return [a, b, pa, pb];
}
function statsView() {
  const st = S.stats, [from, to, pf, pt] = statsRange();
  const list = S.tx.filter(x => x.type === st.type && x.date >= from && x.date <= to);
  const total = round2(list.reduce((a, x) => a + x.base, 0));
  const prev = sumType(st.type, pf, pt);
  const agg = new Map();
  for (const x of list) { const a = agg.get(x.cat) || { v: 0, n: 0 }; a.v += x.base; a.n++; agg.set(x.cat, a); }
  const byCat = [...agg].map(([id, a]) => ({ c: catById(id), v: round2(a.v), n: a.n })).sort((a, b) => b.v - a.v);
  const td0 = todayStr();
  let series, avg, hi = -1, avgLabel;
  if (st.mode === 'month') {
    const n = daysIn(S.month);
    series = Array.from({ length: n }, (_, i) => ({ v: 0, label: String(i + 1), tip: fmtDate(`${S.month}-${pad(i + 1)}`) }));
    for (const x of list) series[Number(x.date.slice(8)) - 1].v += x.base;
    const elapsed = S.month === monthOf(td0) ? Number(td0.slice(8)) : S.month < monthOf(td0) ? n : 0;
    avg = elapsed ? total / elapsed : 0; avgLabel = t('dailyAvg');
    if (S.month === monthOf(td0)) hi = Number(td0.slice(8)) - 1;
  } else {
    const y = S.statsYear;
    series = Array.from({ length: 12 }, (_, i) => ({ v: 0, label: LANG === 'zh' ? String(i + 1) : new Date(y, i, 1).toLocaleDateString('en-GB', { month: 'narrow' }), tip: fmtMonth(`${y}-${pad(i + 1)}`) }));
    for (const x of list) series[Number(x.date.slice(5, 7)) - 1].v += x.base;
    const curY = new Date().getFullYear();
    const firstM = S.tx.reduce((m, x) => (x.date.slice(0, 4) === String(y) ? Math.min(m, Number(x.date.slice(5, 7))) : m), 13);
    const lastM = y === curY ? new Date().getMonth() + 1 : y < curY ? 12 : 0;
    const elapsed = firstM <= lastM ? lastM - firstM + 1 : 0;
    avg = elapsed ? total / elapsed : 0; avgLabel = t('monthlyAvg');
    if (y === curY) hi = new Date().getMonth();
  }
  series.forEach(s => { s.v = round2(toDisp(s.v)); });
  avg = toDisp(avg);
  const change = prev > 0 ? (total - prev) / prev : null;
  const label = st.mode === 'month' ? fmtMonth(S.month) : t('yearLabel', { y: S.statsYear });
  const typeName = st.type === 'expense' ? t('expense') : t('income');
  return html`${heroHTML({ kicker: '', titleHTML: html`<h1>${t('tabStats')}</h1>${segmented('stats-mode', st.mode, [['month', t('month')], ['year', t('year')]], 'small')}` })}
    <div class="period">
      <div class="stepper"><button class="icon-btn" data-act="stats-step" data-d="-1" aria-label="${t('prev')}">${ic('chevL')}</button><span class="period-label">${label}</span><button class="icon-btn" data-act="stats-step" data-d="1" aria-label="${t('next')}">${ic('chevR')}</button></div>
      ${segmented('stats-type', st.type, [['expense', t('expense')], ['income', t('income')]], 'small')}
    </div>
    ${list.length ? html`
      <section class="panel stats-top">
        ${donutHTML(byCat, total, st.type === 'expense' ? t('totalSpent') : t('totalIncome'))}
        <dl class="kpis">
          <div><dt>${avgLabel}</dt><dd class="num">${fmtMoney(avg, dispCur())}</dd></div>
          <div><dt>${st.mode === 'month' ? t('vsLastMonth') : t('vsLastYear')}</dt><dd class="num ${change == null ? '' : change > 0 ? 'up' : 'down'}">${change == null ? '—' : `${change > 0 ? '+' : change < 0 ? MINUS : ''}${fmtNum(Math.abs(change * 100), 1)}%`}</dd></div>
          <div><dt>${t('count')}</dt><dd class="num">${list.length}</dd></div>
        </dl>
      </section>
      <h2 class="sec">${t('byCategory')}</h2>
      <ul class="rank">${byCat.map(({ c, v, n }) => html`<li><button class="rank-row" data-act="cat-detail" data-cat="${c.id}">${tileHTML(c, 'sm')}
        <span class="rank-main"><span class="rank-top"><span class="rank-name">${catName(c)}</span><span class="rank-v num">${fmtDN(v)}</span></span>
        <span class="rank-bar"><i style="width:${((v / byCat[0].v) * 100).toFixed(1)}%;background:${c.color}"></i></span>
        <span class="rank-meta"><span class="num">${fmtNum((v / total) * 100, 1)}%</span><span>${t('nEntries', { n })}</span></span></span></button></li>`)}</ul>
      <h2 class="sec">${st.mode === 'month' ? t('dailyTrend') : t('monthlyTrend')}</h2>
      <section class="panel chart">
        <p class="chart-tip" id="chart-tip">${avg > 0 ? html`<span class="avg-key"></span>${avgLabel} ${fmtMoney(avg, dispCur())}` : ''}</p>
        ${barsHTML(series, avg, hi)}
      </section>`
    : html`<div class="empty compact">${themeMark()}<p class="empty-title">${t('statsEmpty', { type: typeName })}</p></div>`}`;
}

/* ── budget ── */

function budgetView() {
  const ym = S.month, b = budgetStatus(ym);
  const cb = Object.keys(S.budget.cats || {}).filter(id => S.cats.some(c => c.id === id && c.type === 'expense'));
  return html`${heroHTML({ kicker: fmtMonth(ym), titleHTML: html`<h1>${t('tabBudget')}</h1>${monthStepper()}` })}
    ${b ? html`<section class="panel budget-main">
        ${ringHTML(b)}
        <dl class="budget-facts">
          <div><dt>${b.left >= 0 ? t('left') : t('over')}</dt><dd class="num big ${b.level}">${fmtD(Math.abs(b.left))}</dd></div>
          <div><dt>${t('spentOfTotal', { v: fmtD(b.total) })}</dt><dd class="num">${fmtD(b.spent)}</dd></div>
          ${b.perDay > 0 ? html`<div><dt>${t('perDayLeft', { n: b.daysLeft })}</dt><dd class="num">${fmtD(b.perDay)}</dd></div>` : b.daysLeft === 0 && ym < monthOf(todayStr()) ? html`<div><dt>${t('monthEnded')}</dt><dd></dd></div>` : ''}
        </dl>
        <button class="btn small ghost edit-budget" data-act="budget-edit">${t('editBudget')}</button>
      </section>`
    : html`<section class="empty compact">${themeMark()}<p class="empty-title">${t('budgetEmptyTitle')}</p><p class="empty-sub">${t('budgetEmptySub')}</p><div class="empty-btns"><button class="btn primary" data-act="budget-edit">${t('setBudget')}</button></div></section>`}
    <h2 class="sec">${t('catBudgets')}</h2>
    ${cb.length ? html`<ul class="cbud">${cb.map(id => {
      const c = catById(id), s = budgetStatus(ym, id);
      return html`<li><button class="cbud-row ${s.level}" data-act="catbudget-edit" data-cat="${id}">${tileHTML(c, 'sm')}
        <span class="rank-main"><span class="rank-top"><span class="rank-name">${catName(c)}</span><span class="rank-v num">${fmtDN(s.spent)}<small> / ${fmtDN(s.total, 0)}</small></span></span>
        <span class="rank-bar"><i style="width:${Math.min(100, s.pct * 100).toFixed(1)}%"></i></span>
        <span class="rank-meta"><span>${s.left >= 0 ? t('budgetLeft', { v: fmtD(s.left) }) : t('budgetOver', { v: fmtD(-s.left) })}</span><span class="num">${Math.round(s.pct * 100)}%</span></span></span></button></li>`;
    })}</ul>` : html`<p class="muted-line">${t('catBudgetEmpty')}</p>`}
    <button class="btn ghost wide" data-act="catbudget-add">${ic('plus')}<span>${t('addCatBudget')}</span></button>`;
}

/* ── settings ── */

function settingsView() {
  const st = S.settings, L = st.lock;
  const last = st.lastBackup ? Math.floor((Date.now() - st.lastBackup) / 864e5) : null;
  const delays = [[0, t('lockNow')], [60, t('lock1')], [300, t('lock5')], [900, t('lock15')]];
  const R = S.rates.latest;
  const row = (icon, label, { act, value, sub, danger, control, attrs = '' } = {}) => {
    const tag = act ? 'button' : 'div';
    return raw(`<${tag} class="srow ${danger ? 'danger' : ''}" ${act ? `data-act="${act}"` : ''} ${attrs}><span class="srow-ic">${ic(icon).s}</span><span class="srow-main"><span class="srow-label">${esc(label)}</span>${sub ? `<span class="srow-sub">${esc(sub)}</span>` : ''}</span>${control ? control.s : ''}${value != null ? `<span class="srow-val">${esc(value)}</span>` : ''}${act ? ic('chevR', 'chev').s : ''}</${tag}>`);
  };
  return html`${heroHTML({ kicker: `${t('appName')} ${APP_VERSION}`, title: t('tabSettings') })}
    <h2 class="sec">${t('security')}</h2>
    <div class="group">
      ${row(L.credId || !L.on ? 'faceid' : 'lock', L.on && !L.credId ? t('pinLock') : t('faceLock'), { control: html`<label class="switch"><input type="checkbox" data-change="lock-toggle" ${L.on ? 'checked' : ''} ${DEMO ? 'disabled' : ''} aria-label="${t('faceLock')}"><i></i></label>` })}
      ${L.on ? html`${row('clock', t('autoLock'), { value: (delays.find(d => d[0] === L.delay) || delays[1])[1], control: html`<select class="overlay-select" data-change="lock-delay" aria-label="${t('autoLock')}">${delays.map(([v, l]) => html`<option value="${v}" ${v === L.delay ? 'selected' : ''}>${l}</option>`)}</select>` })}
        ${row('key', t('changePin'), { act: 'pin-change' })}` : ''}
    </div>
    <h2 class="sec">${t('appearance')}</h2>
    <div class="group">
      <div class="pick"><div class="pick-head">${ic('palette')}<span>${t('palette')}</span></div>${paletteSwatches()}</div>
      <div class="pick"><div class="pick-head">${ic('appicon')}<span>${t('icon')}</span></div>${iconPicker()}</div>
      <div class="srow col"><span class="srow-ic">${ic('contrast')}</span><span class="srow-main"><span class="srow-label">${t('theme')}</span></span>${segmented('set-theme', st.theme, [['system', t('themeSystem')], ['light', t('themeLight')], ['dark', t('themeDark')]], 'small')}</div>
      <div class="srow col"><span class="srow-ic">${ic('globe')}</span><span class="srow-main"><span class="srow-label">${t('language')}</span></span>${segmented('set-lang', st.lang, [['system', t('langSystem')], ['zh', '中文'], ['en', 'English']], 'small')}</div>
    </div>
    <h2 class="sec">${t('dataSec')}</h2>
    <div class="group">
      ${row('shieldCheck', t('storeWhere'), { value: isStandalone() ? t('storeApp') : isIOS ? t('storeSafari') : t('storeBrowser'), sub: S.persisted === true ? t('storePersist') : S.persisted === false ? t('storeNoPersist') : t('storeUnknown') })}
      ${row('import', t('importTitle'), { act: 'import-open' })}
      ${row('tag', t('categories'), { act: 'cats-open' })}
      ${row('archive', t('backupExport'), { act: 'backup-export', sub: t('lastBackup', { v: last == null ? t('never') : last === 0 ? t('todayAgo') : t('daysAgo', { n: last }) }) })}
      ${row('export', t('backupRestore'), { act: 'backup-restore' })}
      ${row('table', t('csvExport'), { act: 'csv-export' })}
      ${row('trash', t('eraseAll'), { act: 'erase-all', danger: true })}
    </div>
    <h2 class="sec">${t('ratesSec')}</h2>
    <div class="group">
      ${row('exchange', t('baseCur'), { value: `${flag(BASE)} SEK` })}
      <div class="srow col"><span class="srow-ic">${ic('globe')}</span><span class="srow-main"><span class="srow-label">${t('dispCur')}</span></span>${segmented('set-disp', st.display || BASE, DISP_QUICK.map(c => [c, c]), 'small')}</div>
      ${row('search', t('otherCur'), { act: 'disp-other', value: DISP_QUICK.includes(st.display) ? null : `${flag(st.display)} ${st.display}` })}
      ${row('refresh', t('refresh'), { act: 'rates-refresh', sub: R ? t('ratesUpdated', { d: fmtDate(R.date) }) : t('ratesNone') })}
    </div>
    <p class="foot-note">${t('dispCurNote')} ${t('ratesSource')}</p>
    <h2 class="sec">${t('about')}</h2>
    <div class="group about">${themeMark('about-mark')}<p>${t('privacyText')}</p><p class="ver">${t('version')} ${APP_VERSION}</p></div>`;
}

const DISP_QUICK = ['SEK', 'CNY', 'USD', 'EUR'];
async function setDisplay(c) {
  if (c !== BASE && !(S.rates.latest?.rates?.[c] > 0)) {
    await ensureLatestRates(true).catch(() => {});
    if (!(S.rates.latest?.rates?.[c] > 0)) { toast(t('noRateYet', { c })); return; }
  }
  S.settings.display = c;
  await saveSettings();
  const sh = sheetById('disp'); if (sh) closeSheet(sh);
  refreshAll();
  toast(t('dispSet', { c }));
}
function openDispPicker() {
  const cur = dispCur(), R = S.rates.latest;
  const rowFor = c => html`<li><button class="cur-row ${c === cur ? 'on' : ''}" data-act="disp-pick" data-c="${c}"><span class="flag">${flag(c)}</span>
    <span class="cur-main"><b>${c}</b><span>${curName(c)}</span></span><span class="cur-rate num">${c === BASE ? '' : R?.rates?.[c] ? `1 ${c} = ${fmtRate(R.rates[c])} kr` : '—'}</span>${c === cur ? ic('check', 'sm') : ''}</button></li>`;
  openSheet({
    id: 'disp', title: t('dispCur'),
    body: html`<p class="lead">${t('dispCurNote')}${R ? html` ${t('ratesUpdated', { d: fmtDate(R.date) })}` : ''}</p>
      <ul class="cur-list">${[...new Set([...DISP_QUICK, ...(DISP_QUICK.includes(S.settings.display) ? [] : [S.settings.display])])].map(rowFor)}</ul>
      <button class="btn ghost wide" data-act="disp-other">${ic('search')}<span>${t('otherCur')}</span></button>`,
  });
}
function paletteSwatches() {
  const cur = S.settings.palette;
  return html`<div class="pals" role="radiogroup" aria-label="${t('palette')}">${PALETTES.map(p => html`<button class="pal ${p === cur ? 'on' : ''}" data-act="set-palette" data-v="${p}" data-palette="${p}" role="radio" aria-checked="${p === cur ? 'true' : 'false'}">
    <span class="pal-note note-face" aria-hidden="true"><span class="pal-amt num">1,284<small>kr</small></span></span><span class="pal-name">${t('pal_' + p)}</span></button>`)}</div>`;
}
function iconPicker() {
  const cur = PALETTES.includes(S.settings.icon) ? S.settings.icon : S.settings.palette;
  const app = isStandalone();
  const hint = app ? t('iconHintApp') : isIOS ? t('iconHintSafari') : '';
  return html`<div class="icos" role="radiogroup" aria-label="${t('icon')}">${PALETTES.map(p => html`<button class="ico ${p === cur ? 'on' : ''}" data-act="set-icon" data-v="${p}" role="radio" aria-checked="${p === cur ? 'true' : 'false'}" aria-label="${t('pal_' + p)}"><img src="icons/${p}-180.png" alt="" width="56" height="56"></button>`)}</div>
    ${hint ? html`<p class="pick-note">${hint}${app ? html` <button class="txt-btn" data-act="icon-steps">${t('iconSteps')}</button>` : ''}</p>` : ''}`;
}
function openIconSteps() {
  const url = (location.host + location.pathname).replace(/index\.html$/, '');
  openSheet({
    id: 'icon-steps', title: t('iconStepsTitle'), left: html`<button class="txt-btn" data-act="sheet-close">${t('done')}</button>`,
    body: html`<ol class="steps">${['iconStep1', 'iconStep2', 'iconStep3', 'iconStep4', 'iconStep5'].map(k => html`<li>${t(k, { url })}</li>`)}</ol>`,
  });
}

/* ───────────────────────── sheets & dialogs ───────────────────────── */

const sheets = [];
function openSheet({ id = '', title = '', titleHTML, body, left, right, foot, tall, cls = '', onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.dataset.sheet = id;
  wrap.innerHTML = html`<div class="sheet-backdrop" data-act="sheet-close"></div>
    <div class="sheet ${tall ? 'tall' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="grab" data-drag></div>
      <header class="sheet-head" data-drag><div class="sh-l">${left === undefined ? html`<button class="txt-btn" data-act="sheet-close">${t('cancel')}</button>` : left}</div>
        <div class="sh-t">${titleHTML || html`<h2>${title}</h2>`}</div><div class="sh-r">${right || ''}</div></header>
      <div class="sheet-body">${body}</div>${foot ? html`<div class="sheet-foot">${foot}</div>` : ''}
    </div>`.s;
  $('#sheets').appendChild(wrap);
  const rec = { el: wrap, id, onClose };
  rec.body = h => { const b = wrap.querySelector('.sheet-body'); const top = b.scrollTop; b.innerHTML = h.s; b.scrollTop = top; };
  rec.foot = h => { const f = wrap.querySelector('.sheet-foot'); if (f) f.innerHTML = h.s; };
  sheets.push(rec);
  wrap.getBoundingClientRect();
  requestAnimationFrame(() => wrap.classList.add('open'));
  bindDrag(wrap.querySelector('.sheet'), rec);
  return rec;
}
function closeSheet(rec = sheets[sheets.length - 1], instant = false) {
  const i = sheets.indexOf(rec);
  if (!rec || i < 0) return;
  sheets.splice(i, 1);
  rec.onClose?.();
  const el = rec.el;
  if (instant) { el.remove(); return; }
  el.classList.remove('open');
  let done = false;
  const fin = () => { if (!done) { done = true; el.remove(); } };
  el.querySelector('.sheet').addEventListener('transitionend', fin, { once: true });
  setTimeout(fin, 520);
}
const closeAllSheets = instant => { while (sheets.length) closeSheet(sheets[sheets.length - 1], instant); };
const sheetById = id => sheets.find(s => s.id === id);
function bindDrag(sheet, rec) {
  let y0 = null, dy = 0, t0 = 0;
  sheet.querySelectorAll('[data-drag]').forEach(h => h.addEventListener('touchstart', e => {
    if (e.target.closest('button,input,select,label,textarea')) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); sheet.style.transition = 'none';
  }, { passive: true }));
  sheet.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  const end = () => {
    if (y0 == null) return;
    y0 = null; sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 110 || dy / Math.max(1, Date.now() - t0) > 0.6) closeSheet(rec);
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}
function confirmDialog({ title, message, ok = t('ok'), cancel = t('cancel'), danger = false }) {
  return new Promise(res => {
    const w = document.createElement('div');
    w.className = 'dialog-wrap';
    w.innerHTML = html`<div class="dialog" role="alertdialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3>${message ? html`<p>${message}</p>` : ''}
      <div class="dialog-btns"><button class="dlg-btn" data-r="0">${cancel}</button><button class="dlg-btn ${danger ? 'danger' : 'strong'}" data-r="1">${ok}</button></div></div>`.s;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('open'));
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      e.stopPropagation();
      w.classList.remove('open');
      setTimeout(() => w.remove(), 220);
      res(b.dataset.r === '1');
    });
  });
}
let toastTimer;
function toast(msg, { action, onAction, ms = 2400 } = {}) {
  const el = $('#toast');
  el.innerHTML = html`<span>${msg}</span>${action ? html`<button data-act="toast-action">${action}</button>` : ''}`.s;
  S.toastAction = onAction || null;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), action ? Math.max(ms, 6000) : ms);
}
function shake(sel) { const el = typeof sel === 'string' ? $(sel) : sel; if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

/* ───────────────────────── exchange rates ───────────────────────── */

const RATE_TTL = 6 * 3600e3;
async function fetchJSON(url, ms = 9000) {
  const c = new AbortController();
  const tm = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}
const invertRates = m => { const o = { SEK: 1 }; for (const [k, v] of Object.entries(m)) if (v > 0 && /^[A-Z]{3}$/i.test(k)) o[k.toUpperCase()] = 1 / v; o.SEK = 1; return o; };
async function fetchRates(date) {
  let lastErr;
  try {
    const rows = await fetchJSON(`https://api.frankfurter.dev/v2/rates?base=sek${date ? '&date=' + date : ''}`);
    if (Array.isArray(rows) && rows.length) {
      const m = {}; let d = date || null;
      for (const r of rows) if (r && r.quote && r.rate > 0) { m[r.quote] = r.rate; if (r.date && (!d || r.date > d || date)) d = r.date; }
      if (Object.keys(m).length) return { date: d || todayStr(), rates: invertRates(m) };
    }
  } catch (e) { lastErr = e; }
  try {
    const j = await fetchJSON(`https://api.frankfurter.dev/v1/${date || 'latest'}?base=SEK`);
    if (j?.rates) return { date: j.date || date || todayStr(), rates: invertRates(j.rates) };
  } catch (e) { lastErr = e; }
  if (!date) {
    try {
      const j = await fetchJSON('https://open.er-api.com/v6/latest/SEK');
      if (j?.rates) return { date: j.time_last_update_unix ? ymd(new Date(j.time_last_update_unix * 1000)) : todayStr(), rates: invertRates(j.rates) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('rates');
}
async function ensureLatestRates(force = false) {
  if (DEMO) return S.rates.latest;
  const L = S.rates.latest;
  if (!force && L && Date.now() - L.fetchedAt < RATE_TTL) return L;
  if (!force && !navigator.onLine) return L;
  try {
    const r = await fetchRates(null);
    S.rates.latest = { ...r, fetchedAt: Date.now() };
    await db.set('rates', S.rates);
    return S.rates.latest;
  } catch (e) { if (force) throw e; return L; }
}
async function rateFor(cur, date) {
  if (cur === BASE) return { rate: 1, date };
  if (!DEMO && date && date < todayStr()) {
    const h = S.rates.hist[date];
    if (h?.r?.[cur]) return { rate: h.r[cur], date: h.d };
    if (navigator.onLine) {
      try {
        const r = await fetchRates(date);
        S.rates.hist[date] = { d: r.date, r: r.rates };
        const keys = Object.keys(S.rates.hist).sort();
        while (keys.length > 90) delete S.rates.hist[keys.shift()];
        await db.set('rates', S.rates);
        if (r.rates[cur]) return { rate: r.rates[cur], date: r.date };
      } catch { /* fall back to latest */ }
    }
  }
  const L = await ensureLatestRates();
  return L?.rates?.[cur] ? { rate: L.rates[cur], date: L.date } : null;
}
async function ratesForRange(cur, from, to) {
  const map = new Map();
  const fill = obj => { for (const [d, r] of obj) map.set(d, r); };
  try {
    const rows = await fetchJSON(`https://api.frankfurter.dev/v2/rates?from=${from}&to=${to}&base=sek&quotes=${cur.toLowerCase()}`);
    if (Array.isArray(rows)) fill(rows.filter(r => r.rate > 0 && r.date).map(r => [r.date, 1 / r.rate]));
  } catch { /* try v1 */ }
  if (!map.size) {
    try {
      const j = await fetchJSON(`https://api.frankfurter.dev/v1/${from}..${to}?base=SEK&symbols=${cur}`);
      if (j?.rates) fill(Object.entries(j.rates).filter(([, r]) => r[cur] > 0).map(([d, r]) => [d, 1 / r[cur]]));
    } catch { /* fall back to latest */ }
  }
  const latest = (await ensureLatestRates())?.rates?.[cur] || null;
  const dates = [...map.keys()].sort();
  return date => {
    if (map.has(date)) return map.get(date);
    let best = null;
    for (const d of dates) { if (d <= date) best = d; else break; }
    return best ? map.get(best) : dates.length ? map.get(dates[0]) : latest;
  };
}

/* ───────────────────────── entry form ───────────────────────── */

const trimNum = (n, dp) => String(+n.toFixed(dp));
const hasOp = e => /[+-]/.test(e);
function evalExpr(e) {
  if (!e) return 0;
  let s = 0;
  for (const p of e.match(/[+-]?[^+-]+/g) || []) { const v = parseFloat(p); if (!isNaN(v)) s += v; }
  return Math.round(s * 100) / 100;
}
function prettyExpr(e) {
  return e.split(/([+-])/).map(p => {
    if (p === '+' || p === '-') return p === '+' ? ' + ' : ` ${MINUS} `;
    if (!p) return '';
    const [i, d] = p.split('.');
    return (i ? numFmt(0).format(+i) : '0') + (d !== undefined ? '.' + d : '');
  }).join('');
}
function openEntry(tx) {
  if (tx) {
    F = { id: tx.id, orig: tx, type: tx.type, expr: trimNum(tx.amount, dpOf(tx.currency)), cur: tx.currency, rate: tx.rate, rateDate: null, rateManual: true, cat: tx.cat, date: tx.date, note: tx.note || '' };
  } else {
    const type = 'expense';
    const lc = S.lastCat[type];
    F = { type, expr: '', cur: BASE, rate: 1, rateDate: null, rateManual: false, cat: lc && S.cats.some(c => c.id === lc) ? lc : catsOf(type)[0]?.id, date: todayStr(), note: '' };
  }
  openSheet({
    id: 'entry', tall: true, cls: 'entry',
    titleHTML: segmented('f-type', F.type, [['expense', t('expense')], ['income', t('income')]]),
    right: tx ? html`<button class="icon-btn danger" data-act="f-delete" aria-label="${t('delete')}">${ic('trash')}</button>` : '',
    body: html`<div class="f-amount" id="f-amount">${amountHTML()}</div>
      <div class="f-cats" id="f-cats">${catGridHTML()}</div>
      <div class="f-meta">
        <label class="chip date-chip">${ic('calendar')}<span id="f-date-l">${fmtDayShort(F.date)}</span><input type="date" value="${F.date}" data-change="f-date" aria-label="${t('date')}"></label>
        <input class="f-note" id="f-note" type="text" placeholder="${t('notePh')}" value="${F.note}" data-input="f-note" maxlength="80" enterkeyhint="done" autocomplete="off">
      </div>`,
    foot: html`<div class="kp" id="kp">${keypadHTML()}</div>`,
    onClose: () => { F = null; },
  });
  if (F.cur !== BASE && !tx) loadRate();
}
function amountHTML() {
  const val = evalExpr(F.expr), op = hasOp(F.expr);
  const parts = [];
  if (op) parts.push(html`<span>= ${fmtNum(val, dpOf(F.cur))}</span>`);
  if (F.cur !== BASE) {
    if (F.rate > 0) parts.push(html`<button class="rate-link" data-act="f-rate">≈ ${fmtMoney(val * F.rate)}<small>1 ${F.cur} = ${fmtRate(F.rate)} kr</small></button>`);
    else parts.push(F.rateLoading ? html`<span>${t('rateLoading')}</span>` : html`<button class="rate-link warn" data-act="f-rate">${t('rateMissing')}</button>`);
  }
  return html`<button class="cur-btn" data-act="f-cur" aria-label="${t('currency')}"><span class="flag">${flag(F.cur)}</span><span>${F.cur}</span>${ic('chevDown', 'xs')}</button>
    <div class="amt-wrap"><div class="amt-big num ${F.type} ${F.expr ? '' : 'ph'}">${F.expr ? prettyExpr(F.expr) : '0'}</div><div class="amt-sub">${parts}</div></div>`;
}
function catGridHTML() {
  return html`${catsOf(F.type).map(c => html`<button class="cat ${c.id === F.cat ? 'on' : ''}" data-act="f-cat" data-id="${c.id}" style="--c:${c.color}" aria-pressed="${c.id === F.cat}">${tileHTML(c)}<span>${catName(c)}</span></button>`)}
    <button class="cat add" data-act="f-cat-new"><span class="tile" style="--c:#8B969B">${ic('plus')}</span><span>${t('newCat')}</span></button>`;
}
function keypadHTML() {
  const k = (v, label = v, cls = '') => html`<button class="${cls}" data-act="kp" data-k="${v}">${label}</button>`;
  return html`${k('1')}${k('2')}${k('3')}<button class="fn" data-act="kp" data-k="del" aria-label="${t('delete')}">${ic('backspace')}</button>
    ${k('4')}${k('5')}${k('6')}${k('+', '+', 'fn')}
    ${k('7')}${k('8')}${k('9')}${k('-', MINUS, 'fn')}
    ${k('.', '.', dpOf(F.cur) ? '' : 'dim')}${k('0')}<button class="save ${F.type}" data-act="kp-save" id="kp-save">${hasOp(F.expr) ? '=' : t('save')}</button>`;
}
const updAmount = () => { const el = $('#f-amount'); if (el && F) el.innerHTML = amountHTML().s; const s = $('#kp-save'); if (s && F) s.textContent = hasOp(F.expr) ? '=' : t('save'); };
function kpPress(k) {
  let e = F.expr;
  const dp = dpOf(F.cur);
  const seg = e.split(/[+-]/).pop();
  if (k === 'del') e = e.slice(0, -1);
  else if (k === '+' || k === '-') { if (!e) return; e = /[+\-.]$/.test(e) ? e.slice(0, -1) + k : e + k; }
  else if (k === '.') { if (!dp || seg.includes('.')) return; e += seg === '' ? '0.' : '.'; }
  else {
    if (seg.includes('.') && seg.split('.')[1].length >= dp) return;
    if (seg.replace('.', '').length >= 9) return;
    e = seg === '0' ? e.slice(0, -1) + k : e + k;
  }
  F.expr = e;
  updAmount();
}
async function loadRate() {
  if (!F) return;
  if (F.cur === BASE) { F.rate = 1; F.rateLoading = false; updAmount(); return; }
  const tok = (F.tok = (F.tok || 0) + 1);
  F.rateLoading = true; F.rate = 0; updAmount();
  const r = await rateFor(F.cur, F.date).catch(() => null);
  if (!F || tok !== F.tok) return;
  F.rateLoading = false; F.rate = r?.rate || 0; F.rateDate = r?.date || null; F.rateManual = false;
  updAmount();
}
async function saveEntry() {
  if (hasOp(F.expr)) { const v = evalExpr(F.expr); F.expr = v > 0 ? trimNum(v, dpOf(F.cur)) : ''; updAmount(); if (!(v > 0)) toast(t('negative')); return; }
  const amt = evalExpr(F.expr);
  if (!(amt > 0)) { shake('#f-amount .amt-big'); toast(t('enterAmount')); return; }
  if (F.cur !== BASE && !(F.rate > 0)) { toast(t('needRate')); openRateSheet(); return; }
  const rate = F.cur === BASE ? 1 : F.rate;
  const now = Date.now();
  const amount = roundDp(amt, dpOf(F.cur));
  const tx = F.orig ? { ...F.orig } : { id: uid(), ts: now, src: 'manual' };
  Object.assign(tx, { type: F.type, amount, currency: F.cur, rate, base: round2(amount * rate), cat: F.cat, date: F.date, note: F.note.trim(), mt: now });
  await db.put(tx);
  const i = S.tx.findIndex(x => x.id === tx.id);
  if (i >= 0) S.tx[i] = tx; else S.tx.push(tx);
  sortTx();
  if (F.orig && F.orig.src === 'import' && F.orig.cat !== F.cat && F.orig.note) { S.rules[merchantKey(F.orig.note)] = F.cat; db.set('rules', S.rules); }
  S.lastCat[F.type] = F.cat; db.set('lastCat', S.lastCat);
  if (F.cur !== BASE) { S.recentCur = [F.cur, ...S.recentCur.filter(c => c !== F.cur)].slice(0, 5); db.set('recentCur', S.recentCur); }
  const isNew = !F.orig;
  closeSheet(sheetById('entry'));
  if (isNew && S.tab === 'home' && monthOf(tx.date) !== S.month && !S.search) S.month = monthOf(tx.date);
  refreshAll();
  if (isNew && S.tab === 'home' && !sheets.length) { const v = $('#view'); v?.scrollTo({ top: 0, behavior: 'smooth' }); }
  toast(t('saved'));
}
function openRateSheet() {
  const rec = openSheet({
    id: 'rate', title: t('rateTitle'),
    right: html`<button class="txt-btn strong" data-act="rate-save">${t('save')}</button>`,
    body: html`<p class="field-label">${t('rateFor', { c: `${flag(F.cur)} ${F.cur}` })}</p>
      <div class="field"><input id="rate-in" type="text" inputmode="decimal" value="${F.rate > 0 ? fmtRate(F.rate) : ''}" autocomplete="off" placeholder="0.0000"><span class="suffix">SEK</span></div>
      ${F.rateDate ? html`<p class="hint">${t('rateDateNote', { d: fmtDate(F.rateDate) })}</p>` : ''}
      <button class="btn ghost wide" data-act="rate-latest">${ic('refresh')}<span>${t('useLatest')}</span></button>`,
  });
  rec.el.querySelector('#rate-in')?.focus();
}
function openCurrencySheet(current, onPick) {
  S.curPick = onPick; S.curCurrent = current;
  openSheet({
    id: 'cur', title: t('chooseCur'), tall: true,
    body: html`<div class="search in-sheet"><span class="search-ic">${ic('search')}</span><input type="search" placeholder="${t('curSearchPh')}" data-input="cur-q" autocomplete="off" spellcheck="false"></div><ul class="cur-list" id="cur-list">${curListHTML('')}</ul>`,
  });
}
function curListHTML(q) {
  const L = S.rates.latest?.rates || {};
  const codes = [...new Set([BASE, ...S.recentCur, ...COMMON_CUR, ...Object.keys(L).sort()])].filter(c => /^[A-Z]{3}$/.test(c));
  const ql = q.trim().toLowerCase();
  const list = codes.filter(c => !ql || c.toLowerCase().includes(ql) || curName(c).toLowerCase().includes(ql));
  return html`${list.map(c => html`<li><button class="cur-row ${c === S.curCurrent ? 'on' : ''}" data-act="cur-pick" data-c="${c}"><span class="flag">${flag(c)}</span>
    <span class="cur-main"><b>${c}</b><span>${curName(c)}</span></span><span class="cur-rate num">${c === BASE ? '' : L[c] ? `${fmtRate(L[c])} kr` : '—'}</span>${c === S.curCurrent ? ic('check', 'sm') : ''}</button></li>`)}`;
}

/* ───────────────────────── categories editor ───────────────────────── */

function openCatEditor(cat, onSaved) {
  const isNew = !cat.id;
  const E = { type: cat.type, name: isNew ? '' : catName(cat), icon: cat.icon || 'star', color: cat.color || PALETTE[5] };
  const body = () => html`<div class="cat-preview">${tileHTML({ icon: E.icon, color: E.color }, 'lg')}</div>
    <p class="field-label">${t('catName')}</p>
    <div class="field"><input id="cat-name" type="text" value="${E.name}" placeholder="${t('catNamePh')}" maxlength="12" data-input="cat-name" autocomplete="off"></div>
    <p class="field-label">${t('catColor')}</p>
    <div class="swatches">${PALETTE.map(c => html`<button class="swatch ${c === E.color ? 'on' : ''}" style="--c:${c}" data-act="cat-color" data-c="${c}" aria-label="${c}"></button>`)}</div>
    <p class="field-label">${t('catIcon')}</p>
    <div class="icon-grid">${CAT_ICONS.map(n => html`<button class="${n === E.icon ? 'on' : ''}" data-act="cat-icon" data-i="${n}" style="--c:${E.color}" aria-label="${n}">${ic(n)}</button>`)}</div>
    ${!isNew && cat.id !== OTHER[cat.type] ? html`<button class="btn danger-ghost wide" data-act="cat-delete">${ic('trash')}<span>${t('delCat')}</span></button>` : ''}`;
  const rec = openSheet({ id: 'cat-edit', title: isNew ? t('newCat') : t('editCat'), tall: true, right: html`<button class="txt-btn strong" data-act="cat-save">${t('save')}</button>`, body: body() });
  rec.E = E; rec.cat = cat; rec.onSaved = onSaved; rec.draw = () => rec.body(body());
}
async function saveCat(rec) {
  const E = rec.E, cat = rec.cat;
  const name = E.name.trim();
  if (!name) { toast(t('needName')); shake('#cat-name'); return; }
  let saved;
  if (cat.id) {
    saved = S.cats.find(c => c.id === cat.id);
    const def = saved.key ? t('cat_' + saved.key) : null;
    saved.name = name === def ? '' : name;
    saved.icon = E.icon; saved.color = E.color;
  } else {
    saved = { id: 'c_' + uid().slice(0, 8), type: E.type, name, icon: E.icon, color: E.color, order: Math.max(0, ...S.cats.filter(c => c.type === E.type && c.id !== OTHER[E.type]).map(c => c.order)) + 0.5 };
    S.cats.push(saved);
    normalizeOrder();
  }
  await db.set('cats', S.cats);
  closeSheet(rec);
  rec.onSaved?.(saved);
  refreshAll();
  toast(t('catSaved'));
}
function normalizeOrder() {
  for (const type of ['expense', 'income']) {
    const list = S.cats.filter(c => c.type === type).sort((a, b) => (a.id === OTHER[type]) - (b.id === OTHER[type]) || a.order - b.order);
    list.forEach((c, i) => { c.order = i; });
  }
}
async function deleteCat(rec) {
  const cat = rec.cat;
  if (cat.id === OTHER[cat.type]) { toast(t('otherLocked')); return; }
  const used = S.tx.filter(x => x.cat === cat.id);
  if (!await confirmDialog({ title: t('delCat'), message: used.length ? t('delCatMsg', { n: used.length }) : '', ok: t('delete'), danger: true })) return;
  const other = OTHER[cat.type];
  used.forEach(x => { x.cat = other; x.mt = Date.now(); });
  if (used.length) await db.putMany(used);
  S.cats = S.cats.filter(c => c.id !== cat.id);
  delete S.budget.cats[cat.id];
  for (const k of Object.keys(S.rules)) if (S.rules[k] === cat.id) delete S.rules[k];
  await Promise.all([db.set('cats', S.cats), db.set('budget', S.budget), db.set('rules', S.rules)]);
  if (F && F.cat === cat.id) { F.cat = other; }
  closeSheet(rec);
  refreshAll();
  const fc = $('#f-cats'); if (fc && F) fc.innerHTML = catGridHTML().s;
  toast(t('catDeleted'));
}
function openCatsManager() {
  let type = 'expense';
  const body = () => html`${segmented('cm-type', type, [['expense', t('expense')], ['income', t('income')]], 'wide')}
    <ul class="cm-list">${catsOf(type).map(c => html`<li><button class="cm-row" data-act="cm-edit" data-id="${c.id}">${tileHTML(c, 'sm')}<span>${catName(c)}</span>${ic('chevR', 'chev')}</button></li>`)}</ul>
    <button class="btn ghost wide" data-act="cm-new">${ic('plus')}<span>${t('newCat')}</span></button>`;
  const rec = openSheet({ id: 'cats', title: t('categories'), tall: true, left: html`<button class="txt-btn" data-act="sheet-close">${t('done')}</button>`, body: body() });
  rec.refresh = () => rec.body(body());
  rec.setType = v => { type = v; rec.refresh(); };
  rec.type = () => type;
}

/* ───────────────────────── budget sheets ───────────────────────── */

function openBudgetSheet(catId) {
  const cur = catId ? S.budget.cats[catId] : S.budget.total;
  const c = catId ? catById(catId) : null;
  const rec = openSheet({
    id: 'budget', title: c ? catName(c) : t('budgetTitle'),
    right: html`<button class="txt-btn strong" data-act="budget-save">${t('save')}</button>`,
    body: html`${c ? html`<div class="cat-preview">${tileHTML(c, 'lg')}</div>` : ''}<p class="field-label">${t('budgetAmount')}</p>
      <div class="field"><input id="budget-in" type="text" inputmode="decimal" value="${cur > 0 ? trimNum(cur, 2) : ''}" placeholder="0" autocomplete="off"><span class="suffix">kr</span></div>
      <p class="hint">${t('budgetHint')}${dispCur() !== BASE ? ' ' + t('budgetInSek') : ''}</p>
      ${cur > 0 ? html`<button class="btn danger-ghost wide" data-act="budget-remove">${t('removeBudget')}</button>` : ''}`,
  });
  rec.catId = catId;
  rec.el.querySelector('#budget-in')?.focus();
}
function openCatPicker(type, exclude, onPick, title = t('chooseCat')) {
  const list = catsOf(type).filter(c => !exclude.includes(c.id));
  const rec = openSheet({
    id: 'catpick', title, tall: list.length > 10,
    body: list.length ? html`<div class="cat-grid">${list.map(c => html`<button class="cat" data-act="catpick" data-id="${c.id}" style="--c:${c.color}">${tileHTML(c)}<span>${catName(c)}</span></button>`)}</div>` : html`<p class="muted-line">${t('allBudgeted')}</p>`,
  });
  rec.onPick = onPick;
}

/* ───────────────────────── lock: Face ID + passcode ───────────────────────── */

async function faceSupported() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
function faceRegister() {
  return navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Tally' },
      user: { id: rand(16), name: 'Tally', displayName: 'Tally' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none',
    },
  }).then(c => b64u(new Uint8Array(c.rawId)));
}
function faceVerify(credId) {
  return navigator.credentials.get({
    publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: b64ud(credId), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
  }).then(a => {
    if (!a) return false;
    const flags = new Uint8Array(a.response.authenticatorData)[32];
    return b64u(new Uint8Array(a.rawId)) === credId && (flags & 0x05) === 0x05;
  });
}
async function hashPin(pin, saltB64) {
  const salt = saltB64 ? b64d(saltB64) : rand(16);
  const key = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256);
  return { hash: b64(new Uint8Array(bits)), salt: b64(salt) };
}
async function checkPin(pin) {
  const L = S.settings.lock;
  if (!L.pinHash) return false;
  const { hash } = await hashPin(pin, L.pinSalt);
  return hash === L.pinHash;
}
function lockApp() {
  if (!S.settings.lock.on || DEMO) return;
  S.locked = true;
  closeAllSheets(true);
  $$('.dialog-wrap').forEach(d => d.remove());
  F = null;
  $('#app').innerHTML = '';
  S.lockUI = { mode: S.settings.lock.credId ? 'face' : 'pin', entered: '', msg: '' };
  renderLock();
  $('#lock').hidden = false;
}
function renderLock() {
  const L = S.lockUI, st = S.settings.lock;
  const hasFace = !!st.credId;
  const wait = Math.ceil((st.until - Date.now()) / 1000);
  const msg = wait > 0 ? t('tooMany', { s: wait }) : L.msg;
  $('#lock').innerHTML = html`<div class="lock-inner">
    ${themeMark('lock-mark')}
    <h1 class="lock-title">${t('appName')}</h1>
    <p class="lock-sub ${msg ? 'err' : ''}" role="status">${msg || (L.mode === 'pin' ? t('enterPin') : t('lockedSub'))}</p>
    ${L.mode === 'pin'
      ? html`${pinDots(L.entered.length)}${pinPadHTML('lock-pin')}${hasFace ? html`<button class="txt-btn" data-act="lock-face">${t('useFace')}</button>` : ''}`
      : html`<button class="btn primary face-btn" data-act="lock-face">${ic('faceid')}<span>${t('unlockFace')}</span></button><button class="txt-btn" data-act="lock-pinmode">${t('usePin')}</button>`}
  </div>`.s;
}
function unlockApp() {
  S.locked = false;
  $('#lock').hidden = true;
  $('#lock').innerHTML = '';
  renderApp();
  ensureLatestRates().then(() => { if (S.tab === 'settings' || S.settings.display !== BASE) renderView(); }).catch(() => {});
}
async function lockFace() {
  try {
    if (await faceVerify(S.settings.lock.credId)) return unlockApp();
    S.lockUI.msg = t('faceFailed');
  } catch (e) {
    S.lockUI.msg = e?.name === 'NotAllowedError' || e?.name === 'AbortError' ? '' : t('faceFailed');
  }
  if (S.locked) renderLock();
}
async function lockPinPress(k) {
  const L = S.lockUI, st = S.settings.lock;
  if (Date.now() < st.until) { renderLock(); return; }
  if (k === 'del') L.entered = L.entered.slice(0, -1);
  else if (L.entered.length < 6) L.entered += k;
  L.msg = '';
  renderLock();
  if (L.entered.length < 6) return;
  if (await checkPin(L.entered)) {
    st.fails = 0; st.until = 0; await saveSettings();
    unlockApp();
  } else {
    st.fails = (st.fails || 0) + 1;
    if (st.fails >= 5) st.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (st.fails - 5));
    await saveSettings();
    L.entered = ''; L.msg = t('wrongPin');
    renderLock(); shake('.pin-dots');
  }
}
/* passcode setup and verification sheets */
function openPinSetup(onDone) {
  const P = { step: 1, first: '', entered: '' };
  const body = (err) => html`<p class="pin-prompt ${err ? 'err' : ''}">${err || (P.step === 1 ? t('pinNew') : t('pinConfirm'))}</p>${pinDots(P.entered.length)}${pinPadHTML('setup-pin')}<p class="hint center">${t('pinWhy')}</p>`;
  const rec = openSheet({ id: 'pin-setup', title: t('pinSetTitle'), tall: true, body: body() });
  rec.press = async k => {
    if (k === 'del') P.entered = P.entered.slice(0, -1); else if (P.entered.length < 6) P.entered += k;
    if (P.entered.length < 6) { rec.body(body()); return; }
    if (P.step === 1) { P.first = P.entered; P.entered = ''; P.step = 2; rec.body(body()); return; }
    if (P.entered !== P.first) { P.step = 1; P.first = ''; P.entered = ''; rec.body(body(t('pinMismatch'))); shake(rec.el.querySelector('.pin-dots')); return; }
    rec.body(body());
    const ok = await onDone(P.entered);
    if (ok !== false) closeSheet(rec);
    else { P.step = 1; P.first = ''; P.entered = ''; rec.body(body()); }
  };
}
function verifyUser() {
  return new Promise(res => {
    const L = S.settings.lock;
    const V = { entered: '', msg: '' };
    let settled = false;
    const finish = ok => { if (settled) return; settled = true; res(ok); };
    const body = () => html`<p class="pin-prompt ${V.msg ? 'err' : ''}">${V.msg || t('verifySub')}</p>${pinDots(V.entered.length)}${pinPadHTML('verify-pin')}
      ${L.credId ? html`<button class="btn ghost wide" data-act="verify-face">${ic('faceid')}<span>${t('unlockFace')}</span></button>` : ''}`;
    const rec = openSheet({ id: 'verify', title: t('verifyTitle'), tall: true, body: body(), onClose: () => finish(false) });
    rec.face = async () => {
      try { if (await faceVerify(L.credId)) { finish(true); closeSheet(rec); return; } } catch { /* fall through */ }
      V.msg = t('faceFailed'); rec.body(body());
    };
    rec.press = async k => {
      if (Date.now() < L.until) { V.msg = t('tooMany', { s: Math.ceil((L.until - Date.now()) / 1000) }); rec.body(body()); return; }
      if (k === 'del') V.entered = V.entered.slice(0, -1); else if (V.entered.length < 6) V.entered += k;
      V.msg = ''; rec.body(body());
      if (V.entered.length < 6) return;
      if (await checkPin(V.entered)) { L.fails = 0; L.until = 0; await saveSettings(); finish(true); closeSheet(rec); }
      else {
        L.fails = (L.fails || 0) + 1;
        if (L.fails >= 5) L.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (L.fails - 5));
        await saveSettings();
        V.entered = ''; V.msg = t('wrongPin'); rec.body(body()); shake(rec.el.querySelector('.pin-dots'));
      }
    };
  });
}
async function enableLock() {
  const face = await faceSupported();
  if (!face && !await confirmDialog({ title: t('pinLock'), message: t('faceNoSupport'), ok: t('continue') })) { renderView(); return; }
  openPinSetup(async pin => {
    let credId = null;
    if (face) {
      try { credId = await faceRegister(); } catch (e) {
        console.warn('Face ID setup failed', e);
        if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') { toast(t('faceCancelled')); return false; }
        if (!await confirmDialog({ title: t('faceLock'), message: t('faceFailedFallback'), ok: t('usePinOnly') })) return false;
      }
    }
    const { hash, salt } = await hashPin(pin);
    Object.assign(S.settings.lock, { on: true, credId, pinHash: hash, pinSalt: salt, fails: 0, until: 0 });
    await saveSettings();
    renderView();
    toast(credId ? t('lockOn') : t('pinOn'));
    return true;
  });
  // keep the switch honest while setup is in progress
  renderView();
}
async function disableLock() {
  renderView();
  if (!await verifyUser()) return;
  Object.assign(S.settings.lock, { on: false, credId: null, pinHash: null, pinSalt: null, fails: 0, until: 0 });
  await saveSettings();
  renderView();
  toast(t('lockOff'));
}
async function changePin() {
  if (!await verifyUser()) return;
  openPinSetup(async pin => {
    const { hash, salt } = await hashPin(pin);
    Object.assign(S.settings.lock, { pinHash: hash, pinSalt: salt });
    await saveSettings();
    toast(t('pinChanged'));
    return true;
  });
}

/* ───────────────────────── backup, restore, CSV ───────────────────────── */

async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    S.extUntil = Date.now() + 5 * 60e3;
    try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e?.name === 'AbortError') return false; } finally { S.extUntil = 0; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
async function pipeBytes(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
async function deriveKey(password, salt, iter) {
  const km = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBackup(obj, password) {
  let data = te.encode(JSON.stringify(obj));
  const z = 'CompressionStream' in window;
  if (z) data = await pipeBytes(data, new CompressionStream('gzip'));
  const salt = rand(16), iv = rand(12), iter = 310000;
  const key = await deriveKey(password, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { app: 'tally', format: 1, enc: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter, z: z ? 'gzip' : null, salt: b64(salt), iv: b64(iv), data: b64(ct), at: new Date().toISOString() };
}
async function decryptBackup(env, password) {
  const key = await deriveKey(password, b64d(env.salt), env.iter);
  let data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.data)));
  if (env.z === 'gzip') data = await pipeBytes(data, new DecompressionStream('gzip'));
  return JSON.parse(td.decode(data));
}
function backupPayload() {
  const { palette, icon, theme, lang, display } = S.settings;
  return { app: 'tally', v: 1, exportedAt: new Date().toISOString(), tx: S.tx, cats: S.cats, budget: S.budget, rules: S.rules, lastCat: S.lastCat, recentCur: S.recentCur, prefs: { palette, icon, theme, lang, display } };
}
function openBackupExport() {
  const body = (err = '') => html`<p class="lead">${t('backupWhy')}</p>
    <p class="field-label">${t('backupPw')}</p><div class="field"><input id="bk-pw" type="password" autocomplete="new-password" placeholder="${t('backupPwPh')}"></div>
    <p class="field-label">${t('backupPw2')}</p><div class="field"><input id="bk-pw2" type="password" autocomplete="new-password"></div>
    ${err ? html`<p class="hint err">${err}</p>` : ''}
    <button class="btn primary wide" data-act="bk-make">${ic('lock')}<span>${t('makeBackup')}</span></button>`;
  const rec = openSheet({ id: 'backup', title: t('backupTitle'), tall: true, body: body() });
  rec.err = e => rec.body(body(e));
}
async function makeBackup(rec) {
  const pw = $('#bk-pw')?.value || '', pw2 = $('#bk-pw2')?.value || '';
  if (pw.length < 6) return rec.err(t('pwShort'));
  if (pw !== pw2) return rec.err(t('pwMismatch'));
  rec.body(html`<div class="busy">${rosetteMark('spin')}<p>${t('making')}</p></div>`);
  try {
    const env = await encryptBackup(backupPayload(), pw);
    rec.blob = new Blob([JSON.stringify(env)], { type: 'application/json' });
    rec.name = `tally-backup-${todayStr()}.json`;
    rec.body(html`<div class="done-state">${ic('shieldCheck', 'big')}<p class="empty-title">${t('backupReady')}</p><p class="empty-sub">${t('backupReadySub')}</p>
      <button class="btn primary wide" data-act="bk-save">${ic('export')}<span>${t('saveFile')}</span></button></div>`);
  } catch (e) { console.error(e); rec.err(String(e?.message || e)); }
}
async function saveBackupFile(rec) {
  const ok = await shareOrDownload(rec.blob, rec.name);
  if (!ok) return;
  S.settings.lastBackup = Date.now(); S.settings.nagAt = Date.now(); S.settings.backupCount = S.tx.length;
  await saveSettings();
  closeSheet(rec);
  refreshAll();
  toast(t('backupDone'));
}
function pickFile(cb, accept = '') {
  const inp = $('#file-in');
  inp.value = ''; inp.accept = accept;
  S.extUntil = Date.now() + 5 * 60e3;
  inp.onchange = () => { S.extUntil = 0; const f = inp.files?.[0]; if (f) cb(f); };
  inp.oncancel = () => { S.extUntil = 0; };
  inp.click();
}
async function startRestore(file) {
  let env;
  try { env = JSON.parse(await file.text()); } catch { toast(t('notBackup')); return; }
  if (env?.app !== 'tally') { toast(t('notBackup')); return; }
  if (!env.data) return confirmRestore(env);
  const body = (err = '') => html`<p class="field-label">${t('restorePw')}</p><div class="field"><input id="rs-pw" type="password" autocomplete="current-password"></div>
    ${err ? html`<p class="hint err">${err}</p>` : ''}<button class="btn primary wide" data-act="rs-go">${ic('lock')}<span>${t('restoreGo')}</span></button>`;
  const rec = openSheet({ id: 'restore', title: t('restoreTitle'), body: body() });
  rec.env = env; rec.err = e => rec.body(body(e));
  rec.el.querySelector('#rs-pw')?.focus();
}
async function runRestore(rec) {
  const pw = $('#rs-pw')?.value || '';
  rec.body(html`<div class="busy">${rosetteMark('spin')}<p>${t('making')}</p></div>`);
  let payload;
  try { payload = await decryptBackup(rec.env, pw); } catch { rec.err(t('wrongBackupPw')); return; }
  closeSheet(rec);
  confirmRestore(payload);
}
async function confirmRestore(payload) {
  let clean;
  try { clean = sanitizeBackup(payload); } catch { toast(t('notBackup')); return; }
  const d = payload.exportedAt ? fmtDate(ymd(new Date(payload.exportedAt))) : '—';
  if (!await confirmDialog({ title: t('restoreConfirm'), message: t('restoreConfirmMsg', { n: clean.tx.length, d, m: S.tx.length }), ok: t('restoreOk'), danger: true })) return;
  await db.clear();
  await db.putMany(clean.tx);
  Object.assign(S, { tx: clean.tx, cats: clean.cats, budget: clean.budget, rules: clean.rules, lastCat: clean.lastCat, recentCur: clean.recentCur });
  sortTx();
  await Promise.all(['cats', 'budget', 'rules', 'lastCat', 'recentCur'].map(k => db.set(k, S[k])));
  if (Object.keys(clean.prefs).length) { Object.assign(S.settings, clean.prefs); await saveSettings(); applyLang(); applyPalette(); }
  S.month = S.tx[0] ? monthOf(S.tx[0].date) : S.month;
  closeAllSheets();
  S.tab = 'home'; renderApp();
  toast(t('restored', { n: clean.tx.length }));
}
function sanitizeBackup(o) {
  if (!o || o.app !== 'tally' || !Array.isArray(o.tx)) throw new Error('invalid');
  const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const str = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
  let cats = (Array.isArray(o.cats) ? o.cats : []).filter(c => c && typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) && (c.type === 'expense' || c.type === 'income'))
    .map(c => ({ id: c.id, type: c.type, key: typeof c.key === 'string' && STR.zh['cat_' + c.key] ? c.key : undefined, name: str(c.name, 24), icon: ICONS[c.icon] ? c.icon : 'dots', color: okColor(c.color) ? c.color : '#8B969B', order: Number(c.order) || 0 }))
    .filter(c => c.key || c.name);
  for (const d of DEFAULT_CATS) if ((d.id === 'e_other' || d.id === 'i_other') && !cats.some(c => c.id === d.id)) cats.push({ ...d, order: 99 });
  if (cats.length < 3) cats = DEFAULT_CATS.map(c => ({ ...c }));
  const ids = new Set(cats.map(c => c.id));
  const tx = o.tx.filter(x => x && typeof x.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && (x.type === 'expense' || x.type === 'income') && Number.isFinite(+x.amount) && Number.isFinite(+x.base))
    .map(x => ({
      id: x.id.slice(0, 64), type: x.type, amount: Math.abs(+x.amount), currency: /^[A-Z]{3}$/.test(x.currency) ? x.currency : BASE, rate: +x.rate > 0 ? +x.rate : 1, base: Math.abs(+x.base),
      cat: ids.has(x.cat) ? x.cat : OTHER[x.type], date: x.date, note: str(x.note, 120), src: x.src === 'import' ? 'import' : 'manual', ...(typeof x.ext === 'string' ? { ext: x.ext.slice(0, 40) } : {}), ts: +x.ts || Date.now(), mt: +x.mt || Date.now(),
    }));
  const budget = { total: +o.budget?.total > 0 ? +o.budget.total : null, cats: {} };
  for (const [k, v] of Object.entries(o.budget?.cats || {})) if (ids.has(k) && +v > 0) budget.cats[k] = +v;
  const rules = {};
  for (const [k, v] of Object.entries(o.rules || {})) if (typeof k === 'string' && ids.has(v)) rules[k.slice(0, 60)] = v;
  const lastCat = {};
  for (const ty of ['expense', 'income']) if (ids.has(o.lastCat?.[ty])) lastCat[ty] = o.lastCat[ty];
  const recentCur = (Array.isArray(o.recentCur) ? o.recentCur : []).filter(c => /^[A-Z]{3}$/.test(c)).slice(0, 5);
  const pr = o.prefs && typeof o.prefs === 'object' ? o.prefs : {}, prefs = {};
  if (PALETTES.includes(pr.palette)) prefs.palette = pr.palette;
  if ('icon' in pr && (pr.icon === null || PALETTES.includes(pr.icon))) prefs.icon = pr.icon;
  if (['system', 'light', 'dark'].includes(pr.theme)) prefs.theme = pr.theme;
  if (['system', 'zh', 'en'].includes(pr.lang)) prefs.lang = pr.lang;
  if (typeof pr.display === 'string' && /^[A-Z]{3}$/.test(pr.display)) prefs.display = pr.display;
  return { tx, cats, budget, rules, lastCat, recentCur, prefs };
}
async function exportCSV() {
  if (!await confirmDialog({ title: t('csvWarnTitle'), message: t('csvWarnMsg'), ok: t('csvOk') })) return;
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [['date', 'type', 'category', 'amount', 'currency', 'rate_to_SEK', 'amount_SEK', 'note'].join(',')];
  for (const x of [...S.tx].reverse()) lines.push([x.date, x.type, catName(catById(x.cat)), x.amount, x.currency, x.rate, x.base, x.note].map(q).join(','));
  const ok = await shareOrDownload(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }), `tally-${todayStr()}.csv`);
  if (ok) toast(t('csvDone'));
}
async function eraseAll() {
  if (!await confirmDialog({ title: t('eraseTitle'), message: t('eraseMsg'), ok: t('eraseOk'), danger: true })) return;
  await db.clear();
  Object.assign(S, { tx: [], cats: DEFAULT_CATS.map(c => ({ ...c })), budget: { total: null, cats: {} }, rules: {}, lastCat: {}, recentCur: [] });
  await Promise.all(['cats', 'budget', 'rules', 'lastCat', 'recentCur'].map(k => db.set(k, S[k])));
  S.settings.lastBackup = null; await saveSettings();
  S.tab = 'home'; renderApp();
  toast(t('erased'));
}

/* ───────────────────────── statement import: parsing ───────────────────────── */

function decodeText(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return new TextDecoder('utf-8').decode(buf.subarray(3));
  if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* not UTF-8 */ }
  const latin = new TextDecoder('windows-1252').decode(buf);
  let gbk = '';
  try { gbk = new TextDecoder('gbk').decode(buf); } catch { /* unsupported */ }
  const sv = (latin.match(/[åäöÅÄÖé]/g) || []).length;
  const zh = (gbk.match(/[日期金额交易余额摘要收入支出转账商户备注时间记账对方账户币种]/g) || []).length;
  return zh > 3 && zh > sv ? gbk : latin;
}
function parseAmount(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return NaN;
  s = s.replace(/[−–—]/g, '-').replace(/\s*(kr|sek|:-|元|¥|€|\$)\s*$/i, '').replace(/^(kr|sek|¥|€|\$)\s*/i, '').replace(/[\s\u00a0\u202f']/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) { const commas = (s.match(/,/g) || []).length; const tail = s.length - lc - 1; s = commas === 1 && tail !== 3 ? s.replace(',', '.') : s.replace(/,/g, ''); }
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}
/* Dates. Statements write dates in many ways: 2026-10-01, 26-10-01, 01.10.2026, 1 okt, or 10-01 with the
   year printed elsewhere. Unambiguous styles always parse; ambiguous ones are decided once per file by
   detectDateCtx(), so every row of one statement is read the same way. */
const SV_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12 };
function mkDate(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 ? ymd(dt) : null;
}
const y2k = yy => 2000 + Number(yy);
const DATE_FORMS = {
  ymd2: { re: /^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/, f: m => [y2k(m[1]), m[2], m[3]] },
  dmy2: { re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?!\d)/, f: m => [y2k(m[3]), m[2], m[1]] },
  mdy4: { re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/, f: m => [m[3], m[1], m[2]] },
  c6: { re: /^(\d{2})(\d{2})(\d{2})(?!\d)/, f: m => [y2k(m[1]), m[2], m[3]] },
  md: { re: /^(\d{1,2})[-/.](\d{1,2})(?!\d|[-/.]\d)/, f: (m, y) => [y, m[1], m[2]] },
  dm: { re: /^(\d{1,2})[-/.](\d{1,2})(?!\d|[-/.]\d)/, f: (m, y) => [y, m[2], m[1]] },
};
const YEARLESS = new Set(['md', 'dm']);
function parseDate(v, excel = false, ctx = null) {
  if (v == null) return null;
  const s = String(v).trim();
  let m;
  if (excel && /^\d{5}(\.\d+)?$/.test(s)) { const n = +s; if (n > 30000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5); return mkDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } }
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/))) return mkDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/))) return mkDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/))) return ctx?.d4 === 'mdy' ? mkDate(m[3], m[1], m[2]) : mkDate(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/))) return mkDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})\s+([a-zåäö]{3})[a-zåäö]*\.?(?:\s+(\d{4}))?/i)) && SV_MONTHS[m[2].toLowerCase()]) {
    const mo = SV_MONTHS[m[2].toLowerCase()];
    if (m[3]) return mkDate(m[3], mo, m[1]);
    return yearless(ctx?.year || new Date().getFullYear(), mo, m[1]);
  }
  const form = ctx && (ctx.y2 || (ctx.c6 ? 'c6' : null) || ctx.ny);
  if (form && (m = s.match(DATE_FORMS[form].re))) {
    const [y, mo, d] = DATE_FORMS[form].f(m, ctx.year);
    return YEARLESS.has(form) ? yearless(y, mo, d) : mkDate(y, mo, d);
  }
  return null;
}
// A date printed without its year belongs to the statement's year, unless that puts it in the future.
function yearless(y, mo, d) {
  const r = mkDate(y, mo, d);
  return r && r > addDays(todayStr(), 7) ? mkDate(y - 1, mo, d) : r;
}
function guessYear(text) {
  const nowY = new Date().getFullYear(), counts = {};
  for (const m of String(text || '').matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)) {
    const y = +m[1];
    if (y >= nowY - 15 && y <= nowY + 1) counts[y] = (counts[y] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return best ? +best[0] : nowY;
}
function detectDateCtx(samples, docText = '') {
  const nowY = new Date().getFullYear();
  const list = samples.map(s => String(s ?? '').trim()).filter(s => /^\d/.test(s)).slice(0, 500);
  const ctx = { year: guessYear(docText), d4: null, y2: null, c6: false, ny: null, n: list.length, stats: {} };
  if (!list.length) return ctx;
  const plausible = r => !!r && +r.slice(0, 4) >= nowY - 15 && +r.slice(0, 4) <= nowY + 1;
  const hits = (re, f) => list.filter(s => { const m = s.match(re); return m && plausible(mkDate(...f(m, ctx.year))); }).length;
  const st = ctx.stats;
  st.full = list.filter(s => plausible(parseDate(s))).length;
  for (const [k, F] of Object.entries(DATE_FORMS)) st[k] = hits(F.re, F.f);
  st.dmy4 = hits(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/, m => [m[3], m[2], m[1]]);
  if (st.mdy4 > st.dmy4) ctx.d4 = 'mdy';
  const need = Math.max(2, Math.ceil(list.length * 0.5));
  if (st.full < need) {
    if (Math.max(st.ymd2, st.dmy2) >= need) ctx.y2 = st.ymd2 >= st.dmy2 ? 'ymd2' : 'dmy2';
    else if (st.c6 >= need) ctx.c6 = true;
    else if (Math.max(st.md, st.dm) >= need) {
      const dash = list.filter(s => /^\d{1,2}-\d{1,2}(?!\d)/.test(s)).length * 2 > list.length;
      ctx.ny = st.md > st.dm ? 'md' : st.dm > st.md ? 'dm' : dash ? 'md' : 'dm';
    }
  }
  return ctx;
}
const ctxLabel = c => (c ? `${c.y2 || c.ny || (c.c6 ? 'c6' : c.d4 === 'mdy' ? 'mdy4' : 'full')} year=${c.year} n=${c.n} ${JSON.stringify(c.stats)}` : '—');

function parseCSV(text, delim) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"' && field === '') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}
function detectDelim(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  let best = ',', bestScore = 0;
  for (const d of [';', '\t', ',', '|']) {
    const counts = lines.map(l => { let n = 0, q = false; for (const c of l) { if (c === '"') q = !q; else if (c === d && !q) n++; } return n; });
    const freq = {}; counts.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const [mode, cnt] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] || [0, 0];
    const score = +mode > 0 ? cnt * 10 + +mode + (d === ';' || d === '\t' ? 3 : 0) : 0;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
const HDR = {
  date: /^(datum|date|dag|bokf[oö]rd|bokf[oö]rt|bokf[oö]ringsdag|bokf[oö]ringsdatum|bokf\.? ?dag|transaktionsdag|transaktionsdatum|trans\.? ?dag|k[oö]pdag|k[oö]pdatum|valutadag|valutadatum|reskontradatum|transaction ?date|posting ?date|booking ?date|value ?date|日期|交易日期|记账日期|交易时间|入账日期)$/i,
  text: /^(text|beskrivning|specifikation|mottagare|avs[aä]ndare|h[aä]ndelse|transaktionstext|rubrik|meddelande|transaktion|referens|description|details|transaction|merchant|payee|narrative|memo|name|摘要|交易摘要|交易说明|说明|商户|商户名称|对方户名|交易对方|备注)$/i,
  amount: /^(belopp|amount|summa|kronor|transaktionsbelopp|belopp ?sek|belopp i|amount ?sek|金额|交易金额|发生额|收支金额)$/i,
  balance: /^(saldo|balance|beh[aå]llning|bokf[oö]rt saldo|余额|账户余额|交易后余额)$/i,
  kind: /^(typ|type|transaktionstyp|budgetgrupp|kategori|category|交易类型|类型)$/i,
  debit: /^(uttag|debit|debet|utgift|utgifter|withdrawal|withdrawals|paid out|支出|支出金额|借方)$/i,
  credit: /^(ins[aä]ttning|ins[aä]ttningar|credit|kredit|inkomst|deposit|deposits|paid in|存入|收入|收入金额|贷方)$/i,
};
const NUMERIC_KEYS = new Set(['amount', 'balance', 'debit', 'credit']);
const normHead = s => String(s).toLowerCase().replace(/["']/g, '').replace(/\((kr|sek|元)\)|:$/g, '').replace(/\s+(kr|sek)$/, '').replace(/\s+/g, ' ').trim();
function headKey(cell) {
  const h = normHead(cell);
  if (!h || h.length > 40) return null;
  const parts = [h, ...h.split(/\s*[/|]\s*/)];
  for (const k of ['date', 'amount', 'balance', 'text', 'kind', 'debit', 'credit']) if (parts.some(p => HDR[k].test(p))) return k;
  return null;
}
function detectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const m = { headerRow: r, date: -1, text: -1, amount: -1, balance: -1, kind: [], debit: -1, credit: -1, conf: 'header', ctx: null };
    rows[r].forEach((cell, i) => {
      const k = headKey(cell);
      if (!k) return;
      // with two date columns, the purchase date beats the posting date
      if (k === 'date') { if (m.date < 0 || /transakt|transaction|k[oö]p/i.test(normHead(cell))) m.date = i; }
      else if (k === 'kind') m.kind.push(i);
      else if (m[k] < 0) m[k] = i;
    });
    if (m.date >= 0 && (m.amount >= 0 || m.debit >= 0 || m.credit >= 0)) {
      const data = rows.slice(r + 1);
      if (m.text < 0) m.text = guessTextCol(data.slice(0, 30), [m.date, m.amount, m.balance, m.debit, m.credit, ...m.kind]);
      m.ctx = detectDateCtx(data.map(x => x[m.date]), rows.slice(0, 80).flat().join(' '));
      return m;
    }
  }
  return inferColumns(rows);
}
function guessTextCol(sample, exclude) {
  const width = Math.max(0, ...sample.map(r => r.length));
  let best = -1, bestLen = 0;
  for (let i = 0; i < width; i++) {
    if (exclude.includes(i)) continue;
    const vals = sample.map(r => r[i] || '').filter(Boolean);
    if (!vals.length || vals.filter(v => !Number.isNaN(parseAmount(v))).length > vals.length / 2) continue;
    const avg = vals.reduce((a, v) => a + v.length, 0) / vals.length;
    if (avg > bestLen) { bestLen = avg; best = i; }
  }
  return best;
}
function inferColumns(rows) {
  const sample = rows.filter(r => r.length >= 2).slice(0, 40);
  const width = Math.max(0, ...sample.map(r => r.length));
  const docText = rows.slice(0, 80).flat().join(' ');
  let date = -1, ds = 0, dctx = null;
  for (let i = 0; i < width; i++) {
    const c = detectDateCtx(sample.map(r => r[i]), docText);
    const s = sample.filter(r => parseDate(r[i], true, c)).length / Math.max(1, sample.length);
    if (s > ds) { ds = s; date = i; dctx = c; }
  }
  const nums = [];
  for (let i = 0; i < width; i++) if (i !== date && sample.filter(r => r[i] && !Number.isNaN(parseAmount(r[i])) && /[.,]\d{2}\b|^-?\d+$/.test(String(r[i]).trim())).length / Math.max(1, sample.length) > 0.7) nums.push(i);
  const m = { headerRow: -1, date, text: guessTextCol(sample, [date, ...nums]), amount: nums.length ? nums[nums.length >= 2 ? nums.length - 2 : 0] : -1, balance: nums.length >= 2 ? nums[nums.length - 1] : -1, kind: [], debit: -1, credit: -1, conf: 'guess', ctx: dctx };
  if (ds < 0.5 || m.amount < 0) m.conf = 'low';
  return m;
}
function recsFromTable(table) {
  const { rows, map, excel } = table;
  const recs = [];
  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const date = parseDate(row[map.date], excel, map.ctx);
    if (!date) continue;
    let amount;
    if (map.amount >= 0) amount = parseAmount(row[map.amount]);
    else {
      const d = parseAmount(row[map.debit]), c = parseAmount(row[map.credit]);
      amount = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    const text = ((map.text >= 0 ? row[map.text] : '') || '').replace(/\s+/g, ' ').trim();
    if (SUMMARY_LINE_RE.test(text)) continue;
    const balance = map.balance >= 0 ? parseAmount(row[map.balance]) : NaN;
    recs.push({ date, text, amount: round2(amount), balance: Number.isFinite(balance) ? balance : null, kind: map.kind.map(i => row[i]).filter(Boolean).join(' ') });
  }
  return recs;
}
function fromTable(rows, src, excel = false) {
  const map = detectColumns(rows);
  const table = { rows, map, excel };
  const head = map.headerRow >= 0 ? rows[map.headerRow].map(normHead) : [];
  const ica = head.includes('datum') && head.includes('text') && head.includes('belopp') && (head.includes('saldo') || head.includes('typ'));
  return { source: ica ? 'ICA Banken' : src, recs: map.date >= 0 ? recsFromTable(table) : [], table, ctx: map.ctx };
}

/* Lines of text: pasted lists and PDFs without a recognisable table header. */
const MONEY_RE = /(?<![\w.,])[-−–+]?\s?(?:\d{1,3}(?:[     .,]\d{3})+|\d+)[.,]\d{2}(?:\s?(?:kr|sek))?(?![\w]|[.,]\d)|(?<![\w.,])[-−–+]?\s?\d+(?:[     ]\d{3})*\s?(?:kr|sek)(?![\w]|[.,]\d)/giu;
const MONEY_CELL_RE = /^[-−–+]?\s?(?:\d{1,3}(?:[\s.,']\d{3})+|\d+)[.,]\d{2}(?:\s?(?:kr|sek))?[-−]?$/iu;
const LEAD_DATE_RE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{6,8}|\d{1,2}\s+[a-zåäö]{3,9}\.?(?:\s+\d{4})?)(?!\d)/iu;
const DATEISH_RE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{6,8}|\d{1,2}\s+[a-zåäö]{3,9}\.?(?:\s+\d{4})?)$/iu;
function moneyTokens(line) {
  const toks = [];
  for (const m of line.matchAll(MONEY_RE)) { const v = parseAmount(m[0]); if (Number.isFinite(v)) toks.push({ index: m.index, value: v }); }
  return toks;
}
function leadDate(line, ctx) {
  const m = line.match(LEAD_DATE_RE);
  if (!m) return null;
  const d = parseDate(m[1], false, ctx);
  return d ? { d, len: m[0].length } : null;
}
function fromLines(lines, src, ctx = null, docText = '') {
  lines = lines.map(l => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  ctx ||= detectDateCtx(lines.map(l => (l.match(LEAD_DATE_RE) || [])[1]).filter(Boolean), docText || lines.join('\n'));
  const recs = [];
  let date = null, buf = [];
  for (let line of lines) {
    const ld = leadDate(line, ctx);
    if (ld) {
      date = ld.d; buf = [];
      line = line.slice(ld.len).trim();
      const ld2 = leadDate(line, ctx);
      if (ld2) line = line.slice(ld2.len).trim();
    }
    if (!date || !line) continue;
    const toks = moneyTokens(line);
    if (!toks.length) { buf.push(line); continue; }
    const before = line.slice(0, toks[0].index).trim();
    if (before) buf.push(before);
    const text = buf.join(' ').trim();
    buf = [];
    if (!text) { const last = recs[recs.length - 1]; if (last && last.date === date && last.balance == null && toks.length === 1) last.balance = toks[0].value; continue; }
    if (SUMMARY_LINE_RE.test(text)) continue;
    const pick = toks.length >= 2 ? toks.slice(-2) : toks;
    recs.push({ date, text, amount: round2(pick[0].value), balance: pick[1] ? pick[1].value : null, alt: pick[1] ? round2(pick[1].value) : null, kind: '' });
  }
  return { source: src, recs: resolveBalanceColumn(recs).filter(r => r.amount !== 0), table: null, ctx };
}
function resolveBalanceColumn(recs) {
  const two = recs.filter(r => r.alt != null);
  if (two.length < 3) { recs.forEach(r => delete r.alt); return recs; }
  const fits = (amt, bal) => {
    let ok = 0;
    for (let i = 1; i < recs.length; i++) {
      const a = recs[i - 1], b = recs[i];
      if (bal(a) == null || bal(b) == null) continue;
      if (Math.abs(bal(a) - bal(b) - amt(a)) < 0.011 || Math.abs(bal(b) - bal(a) - amt(b)) < 0.011) ok++;
    }
    return ok;
  };
  const h1 = fits(r => r.amount, r => r.balance), h2 = fits(r => r.alt ?? r.amount, r => (r.alt != null ? r.amount : null));
  if (h2 > h1) for (const r of recs) if (r.alt != null) { const a = r.amount; r.amount = r.alt; r.balance = a; }
  recs.forEach(r => delete r.alt);
  return recs;
}
function parseText(text, src) {
  const delim = detectDelim(text);
  let res = null;
  if (delim === '\t' || delim === ';') {
    const rows = parseCSV(text, delim);
    if (rows.length >= 2) { const r = fromTable(rows, src); if (r.recs.length) res = r; }
  }
  res ||= fromLines(text.split(/\r?\n/), src);
  res.diag = diagForRows(t('srcText'), res, res.table ? res.table.rows.map(r => r.join(' | ')) : text.split(/\r?\n/));
  return res;
}

/* Excel and HTML tables */
async function inflateRaw(u8) {
  if (!('DecompressionStream' in window)) throw new AppError('impBadFile');
  return pipeBytes(u8, new DecompressionStream('deflate-raw'));
}
async function unzip(buf, want) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new AppError('impBadFile');
  const n = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < n && off + 46 <= buf.length; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const name = td.decode(buf.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const data = buf.subarray(start, start + csize);
    files[name] = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
  }
  return files;
}
const xmlDoc = u8 => new DOMParser().parseFromString(td.decode(u8), 'application/xml');
const colIndex = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
async function xlsxRows(buf) {
  const files = await unzip(buf, n => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  let sheet = null;
  try {
    const first = xmlDoc(files['xl/workbook.xml']).getElementsByTagNameNS('*', 'sheet')[0];
    const rid = first && [...first.attributes].find(a => a.localName === 'id')?.value;
    for (const r of xmlDoc(files['xl/_rels/workbook.xml.rels']).getElementsByTagNameNS('*', 'Relationship')) {
      if (r.getAttribute('Id') === rid) { const tg = r.getAttribute('Target').replace(/^\//, ''); sheet = tg.startsWith('xl/') ? tg : 'xl/' + tg; }
    }
  } catch { /* use the first sheet file */ }
  if (!sheet || !files[sheet]) sheet = Object.keys(files).filter(k => k.startsWith('xl/worksheets/')).sort()[0];
  if (!sheet || !files[sheet]) throw new AppError('impBadFile');
  const ss = files['xl/sharedStrings.xml'] ? [...xmlDoc(files['xl/sharedStrings.xml']).getElementsByTagNameNS('*', 'si')].map(si => [...si.getElementsByTagNameNS('*', 't')].map(x => x.textContent).join('')) : [];
  const rows = [];
  for (const row of xmlDoc(files[sheet]).getElementsByTagNameNS('*', 'row')) {
    const arr = [];
    for (const c of row.getElementsByTagNameNS('*', 'c')) {
      const ref = (c.getAttribute('r') || '').replace(/\d+/g, '');
      const tt = c.getAttribute('t');
      let v;
      if (tt === 'inlineStr') v = [...c.getElementsByTagNameNS('*', 't')].map(x => x.textContent).join('');
      else { const ve = c.getElementsByTagNameNS('*', 'v')[0]; v = ve ? ve.textContent : ''; if (tt === 's') v = ss[+v] ?? ''; }
      arr[ref ? colIndex(ref) : arr.length] = String(v).trim();
    }
    const r = Array.from(arr, x => x ?? '');
    if (r.some(x => x)) rows.push(r);
  }
  return rows;
}
function htmlTableRows(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return [...doc.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(c => c.textContent.replace(/\s+/g, ' ').trim())).filter(r => r.some(Boolean));
}

/* PDF statements. pdf.js reads the text; rows and columns are rebuilt from where each piece of text sits. */
async function loadPdfjs() {
  await import(new URL('./stream-polyfill.js', import.meta.url).href);
  const pdfjs = await import(new URL('./pdf.min.js', import.meta.url).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.shim.js', import.meta.url).href;
  return pdfjs;
}
// Read text with a stream reader: Safari cannot iterate streams with `for await` yet.
async function readTextItems(page) {
  const reader = page.streamTextContent().getReader();
  const items = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value?.items) items.push(...value.items);
  }
  return items;
}
async function pdfRead(buf, password) {
  if (DEMO) throw new AppError('impPdfDemo');
  let pdfjs;
  try { pdfjs = await loadPdfjs(); } catch (e) { throw new AppError('impPdfFail', e); }
  const task = pdfjs.getDocument({ data: buf.slice(), password: password || undefined, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const items = (await readTextItems(page)).filter(i => i.str && i.str.trim() && i.transform)
        .map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str, h: Math.abs(i.transform[3]) || Math.abs(i.transform[0]) || 10 }));
      pages.push({ items: items.length, rows: pdfRows(items) });
      try { page.cleanup(); } catch { /* nothing to free */ }
    }
    return { version: pdfjs.version, numPages: doc.numPages, pages };
  } catch (e) {
    if (e?.name === 'PasswordException') throw new AppError(e.code === 2 ? 'impPdfWrongPw' : 'impPdfNeedPw', e);
    throw e instanceof AppError ? e : new AppError('impPdfFail', e);
  } finally {
    try { await task.destroy(); } catch { /* already closed */ }
  }
}
// Group text pieces into rows by baseline, then into cells by the gaps between them.
function pdfRows(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let cur = null;
  for (const it of sorted) {
    if (!cur || Math.abs(it.y - cur.y) > Math.max(2, Math.min(it.h, cur.h) * 0.45)) { cur = { y: it.y, h: it.h, items: [] }; rows.push(cur); }
    cur.items.push(it);
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of r.items) {
      const c = cells[cells.length - 1];
      const gap = c ? it.x - c.x1 : Infinity;
      if (c && gap <= Math.max(3, it.h * 0.8)) {
        c.s += gap > Math.max(1, it.h * 0.12) && !/\s$/.test(c.s) && !/^\s/.test(it.s) ? ' ' + it.s : it.s;
        c.x1 = Math.max(c.x1, it.x + it.w);
      } else cells.push({ x0: it.x, x1: it.x + it.w, s: it.s });
    }
    r.cells = cells.map(c => ({ ...c, s: c.s.replace(/\s+/g, ' ').trim() })).filter(c => c.s);
    delete r.items;
  }
  return rows.filter(r => r.cells.length);
}
// Text printed too close together can merge into one cell that spans several columns (a date and the
// description, or an amount and the balance). Split such a cell at its leading date and trailing amounts.
function splitCell(c) {
  const s = c.s;
  const len = Math.max(1, s.length), at = k => c.x0 + ((c.x1 - c.x0) * k) / len;
  const out = [];
  let off = 0;
  const lead = s.match(LEAD_DATE_RE);
  if (lead && lead[0].length < s.length && /^\s+\S/.test(s.slice(lead[0].length))) {
    out.push({ x0: c.x0, x1: at(lead[0].length), s: lead[1] });
    off = s.length - s.slice(lead[0].length).trimStart().length;
  }
  const rest = s.slice(off);
  const toks = [...rest.matchAll(MONEY_RE)];
  let k = toks.length;
  while (k > 0) {
    const tk = toks[k - 1];
    const end = k === toks.length ? rest.trimEnd().length : toks[k].index;
    if (rest.slice(tk.index + tk[0].length, end).trim()) break;
    k--;
  }
  if (k === toks.length) { out.push({ x0: at(off), x1: c.x1, s: rest.trim() }); return out.filter(x => x.s); }
  const head = rest.slice(0, toks[k].index).trim();
  if (head) out.push({ x0: at(off), x1: at(off + toks[k].index), s: head });
  for (let j = k; j < toks.length; j++) out.push({ x0: at(off + toks[j].index), x1: at(off + toks[j].index + toks[j][0].length), s: toks[j][0].trim() });
  return out.filter(x => x.s);
}
function nearestCol(cols, c, pool) {
  const ids = pool && pool.length ? pool : cols.map((_, i) => i);
  let best = ids[0], bestOv = -Infinity;
  for (const i of ids) {
    const ov = Math.min(c.x1, cols[i].x1) - Math.max(c.x0, cols[i].x0); // overlap, or minus the gap
    if (ov > bestOv) { bestOv = ov; best = i; }
  }
  return best;
}
function assignCells(cols, rowCells) {
  const spans = c => cols.filter(col => Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0) > Math.min(6, (col.x1 - col.x0) * 0.3)).length;
  const cells = rowCells.flatMap(c => (spans(c) >= 2 ? splitCell(c) : [c]));
  const out = cols.map(() => []);
  const numCols = cols.map((c, i) => (NUMERIC_KEYS.has(c.key) ? i : -1)).filter(i => i >= 0);
  const dateCols = cols.map((c, i) => (c.key === 'date' ? i : -1)).filter(i => i >= 0);
  const otherCols = cols.map((c, i) => (!NUMERIC_KEYS.has(c.key) && c.key !== 'date' ? i : -1)).filter(i => i >= 0);
  const money = cells.filter(c => MONEY_CELL_RE.test(c.s));
  const rest = cells.filter(c => !MONEY_CELL_RE.test(c.s));
  // When a row has one amount per numeric column, their order settles which is which.
  if (money.length && money.length === numCols.length) money.forEach((c, k) => out[numCols[k]].push(c.s));
  else for (const c of money) out[nearestCol(cols, c, numCols)].push(c.s);
  for (const c of rest) out[nearestCol(cols, c, DATEISH_RE.test(c.s) && dateCols.length ? dateCols : otherCols)].push(c.s);
  return out.map(v => v.join(' ').trim());
}
function pdfTable(pdf, src) {
  let header = null, cols = null, remap = null;
  const out = [];
  pdf.pages.forEach((pg, pi) => {
    for (const row of pg.rows) {
      const keys = row.cells.map(c => headKey(c.s));
      if (keys.includes('date') && keys.some(k => k === 'amount' || k === 'debit' || k === 'credit')) {
        cols = row.cells.map((c, i) => ({ x0: c.x0, x1: c.x1, key: keys[i], label: c.s }));
        if (!header) { header = cols.map(c => c.label); remap = cols.map((_, i) => i); }
        else {
          // a repeated header on a later page: line its columns up with the first page's
          const firstKeys = header.map(h => headKey(h));
          remap = cols.map(c => { const j = header.findIndex(h => normHead(h) === normHead(c.label)); return j >= 0 ? j : firstKeys.indexOf(c.key); });
        }
        continue;
      }
      if (!cols) continue;
      const vals = assignCells(cols, row.cells);
      const strs = header.map(() => '');
      vals.forEach((v, i) => { const j = remap[i]; if (j >= 0 && v) strs[j] = strs[j] ? `${strs[j]} ${v}` : v; });
      out.push({ strs, y: row.y, h: row.h, page: pi });
    }
  });
  if (!header || !out.length) return null;
  const map = detectColumns([header, ...out.map(o => o.strs)]);
  if (map.headerRow !== 0) return null;
  const numIdx = [map.amount, map.debit, map.credit].filter(i => i >= 0);
  const rows = [header];
  let last = null;
  for (const o of out) {
    const s = o.strs;
    const hasDate = !!parseDate(s[map.date], false, map.ctx);
    const hasAmt = numIdx.some(i => Number.isFinite(parseAmount(s[i])));
    const near = last && last.page === o.page && last.y - o.y <= Math.max(o.h, last.h) * 2.8;
    if (!hasDate && !hasAmt) {
      // a description that wrapped onto the next line belongs to the entry above it
      const extra = s.filter(Boolean).join(' ');
      if (near && map.text >= 0 && extra && !SUMMARY_LINE_RE.test(extra)) { last.row[map.text] = `${last.row[map.text]} ${extra}`.trim(); last.y = o.y; }
      continue;
    }
    if (!hasDate) {
      // statements that print each date once: later entries of that day inherit it
      if (!near) continue;
      s[map.date] = last.row[map.date];
    }
    if (SUMMARY_LINE_RE.test(map.text >= 0 ? s[map.text] : '')) { last = null; continue; }
    rows.push(s);
    last = { row: s, y: o.y, h: o.h, page: o.page };
  }
  const res = fromTable(rows, src, false);
  res.header = header;
  return res;
}
function fromPdf(pdf, src) {
  const items = pdf.pages.reduce((a, p) => a + p.items, 0);
  if (!items) throw new AppError('impPdfNoText');
  const lines = pdf.pages.flatMap(p => p.rows.map(r => r.cells.map(c => c.s).join(' ')));
  const table = pdfTable(pdf, src);
  const plain = fromLines(lines, src, null, lines.join('\n'));
  const useTable = table && table.recs.length && table.recs.length >= plain.recs.length * 0.8;
  const res = useTable ? table : plain;
  const sample = pdf.pages.slice(0, 2).flatMap(p => p.rows.map(r => r.cells.map(c => `${Math.round(c.x0)}:${maskText(c.s)}`).join('  ')));
  res.diag = diagText([
    `PDF · pdf.js ${pdf.version} · ${pdf.numPages} pages · ${items} text items`,
    `table: ${table ? `${table.recs.length} found, header ${maskText(table.header.join(' | '))}` : 'no header row'} · lines: ${plain.recs.length} found · using ${useTable ? 'table' : 'lines'}`,
    `dates: ${ctxLabel(res.ctx)}`,
  ], sample);
  return res;
}

/* Format info: the structure of a file with every letter turned into a and every digit into 9,
   so someone helping can see the layout without seeing any amounts, names or dates. */
const KEEP_WORDS = new Set(('datum date text typ belopp saldo summa bokförd bokfört bokföringsdag bokföringsdatum transaktionsdag transaktionsdatum valutadag '
  + 'valutadatum reskontradatum specifikation beskrivning mottagare avsändare meddelande referens händelse uttag insättning insättningar kredit debet '
  + 'ingående utgående kontoutdrag kontohändelser period sida av konto kr sek eur usd kortköp korttransaktion reservation reserverat överföring swish '
  + 'autogiro avgift ränta budgetgrupp kategori jan feb mar apr maj jun jul aug sep okt nov dec januari februari mars april juni juli augusti september '
  + 'oktober november december amount balance description total opening closing page of').split(' '));
const maskWord = w => (KEEP_WORDS.has(w.toLowerCase()) ? w : w.replace(/\p{L}/gu, ch => (ch !== ch.toLowerCase() ? 'A' : 'a')));
const maskText = s => String(s ?? '').replace(/\p{L}+/gu, maskWord).replace(/\d/g, '9');
const errText = e => `${e?.name || 'Error'}: ${e?.message || e}`.replace(/\s+/g, ' ').slice(0, 300);
function diagText(head, sample = []) {
  return [`Tally ${APP_VERSION}`, `UA: ${navigator.userAgent}`, ...head, '---', ...sample.filter(l => String(l).trim()).slice(0, 70).map(l => String(l).slice(0, 180))].join('\n');
}
function diagForRows(kind, res, lines) {
  return diagText([`${kind} · found ${res.recs.length}`, `dates: ${ctxLabel(res.ctx)}`], lines.map(maskText));
}

async function parseImportFile(file, password) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    let pdf;
    try { pdf = await pdfRead(buf, password); } catch (e) {
      console.error('PDF read failed', e?.cause || e);
      if (e instanceof AppError && e.code === 'impPdfFail') e.diag = diagText(['PDF', `error: ${errText(e.cause)}`]);
      throw e instanceof AppError ? e : new AppError('impPdfFail', e);
    }
    return fromPdf(pdf, t('srcPDF'));
  }
  let res, lines;
  if (buf[0] === 0x50 && buf[1] === 0x4B) { const rows = await xlsxRows(buf); res = fromTable(rows, t('srcExcel'), true); lines = rows.map(r => r.join(' | ')); }
  else if (buf[0] === 0xD0 && buf[1] === 0xCF) throw new AppError('impOldXls');
  else {
    const text = decodeText(buf);
    if (/^\s*<(!doctype|html|table|\?xml)/i.test(text) || /<table[\s>]/i.test(text.slice(0, 4000))) {
      const rows = htmlTableRows(text);
      if (rows.length) { res = fromTable(rows, t('srcExcel')); lines = rows.map(r => r.join(' | ')); }
    }
    if (!res) {
      const rows = parseCSV(text, detectDelim(text));
      if (rows.length >= 2 && rows.filter(r => r.length >= 3).length >= rows.length * 0.5) { res = fromTable(rows, t('srcCSV')); lines = rows.map(r => r.join(' | ')); }
      else { res = fromLines(text.split(/\r?\n/), t('srcText')); lines = text.split(/\r?\n/); }
    }
  }
  res.diag = diagForRows(res.source, res, lines);
  return res;
}

/* ───────────────────────── statement import: review ───────────────────────── */

const cleanText = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
const normText = s => cleanText(s).toLowerCase();
function merchantKey(text) {
  return normText(text)
    .replace(/(?<![\p{L}])(kortköp|korttransaktion|kortkop|köp|reservation|reserverat|betalning|swish|autogiro|e-faktura|card purchase|purchase)(?![\p{L}])/gu, ' ')
    .replace(/[0-9*#/\\.:,_+-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}
function guessCat(text, kind, type) {
  const key = merchantKey(text);
  const ruled = S.rules[key];
  if (ruled && S.cats.some(c => c.id === ruled && c.type === type)) return ruled;
  const hay = `${text} ${kind || ''}`;
  for (const [ck, re] of KW_RE[type]) {
    if (ck === 'groceries' && /ica ?banken/i.test(hay)) continue;
    if (re.test(hay)) { const c = S.cats.find(c => c.key === ck && c.type === type); if (c) return c.id; }
  }
  return OTHER[type];
}
function buildCands(P) {
  const keys = new Set(S.tx.map(x => x.ext).filter(Boolean));
  const occ = new Map();
  const manual = S.tx.filter(x => x.src === 'manual');
  // The same bank line can arrive from different sources (CSV, Excel, PDF, pasted text) that differ in
  // whether they carry a balance, so also match on date + amount + description, counting repeats.
  const sigOf = (date, type, amt, text) => `${date}|${type}|${amt.toFixed(2)}|${normText(text)}`;
  const have = new Map();
  for (const x of S.tx) if (x.src === 'import' && x.currency === P.cur) { const k = sigOf(x.date, x.type, x.amount, x.note); have.set(k, (have.get(k) || 0) + 1); }
  const seen = new Map();
  P.cands = P.recs.map(r => {
    const signed = P.flip ? -r.amount : r.amount;
    const type = signed < 0 ? 'expense' : 'income';
    const amt = Math.abs(signed);
    const base = `${r.date}|${signed.toFixed(2)}|${normText(r.text)}|${r.balance ?? ''}`;
    const n = (occ.get(base) || 0) + 1; occ.set(base, n);
    const ext = `${fnv(base)}.${n}`;
    const sig = sigOf(r.date, type, roundDp(amt, dpOf(P.cur)), r.text);
    const m = (seen.get(sig) || 0) + 1; seen.set(sig, m);
    const dup = keys.has(ext) || m <= (have.get(sig) || 0);
    const transfer = TRANSFER_RE.test(`${r.text} ${r.kind}`);
    const pending = PENDING_RE.test(`${r.text} ${r.kind}`);
    const maybe = !dup && manual.some(x => x.type === type && Math.abs(dayDiff(x.date, r.date)) <= 2 && (P.cur === BASE ? Math.abs(x.base - amt) < 0.011 : x.currency === P.cur && Math.abs(x.amount - amt) < 0.011));
    const prev = P.cands?.find(c => c.ext === ext && c.manual);
    return { ...r, amt, type, ext, dup, transfer, pending, maybe, cat: prev ? prev.cat : guessCat(r.text, r.kind, type), manual: !!prev, on: !dup && !transfer && !pending && !maybe };
  });
}
function openImport() {
  const rec = openSheet({
    id: 'import', title: t('importTitle'), tall: true,
    body: html`<p class="privacy-line">${ic('shieldCheck')}<span>${t('impPrivacy')}</span></p>
      <div class="choices">
        <button class="choice" data-act="imp-file">${ic('file')}<span><b>${t('impFile')}</b><small>${t('impFileSub')}</small></span></button>
        <button class="choice" data-act="imp-paste">${ic('paste')}<span><b>${t('impPaste')}</b><small>${t('impPasteSub')}</small></span></button>
      </div>
      <div id="imp-paste-box" class="paste-box" hidden>
        <textarea id="imp-text" rows="7" placeholder="${t('impPastePh')}" spellcheck="false" autocomplete="off"></textarea>
        <button class="btn primary wide" data-act="imp-paste-go">${t('impRead')}</button>
      </div>
      <details class="howto"><summary>${t('icaHowTitle')}</summary><ol><li>${t('icaHow1')}</li><li>${t('icaHow2')}</li><li>${t('icaHow3')}</li><li>${t('icaHow4')}</li></ol></details>
      <div id="imp-err" class="imp-err" hidden></div>`,
  });
  return rec;
}
const DIAG_CODES = new Set(['impPdfFail', 'impBadFile']);
function importError(e) {
  console.warn('import', e);
  const box = $('#imp-err');
  const code = e instanceof AppError ? e.code : 'impBadFile';
  const msg = t(code);
  if (!box) { toast(msg); return; }
  const diag = DIAG_CODES.has(code) ? (e?.diag || diagText([`error: ${errText(e?.cause || e)}`])) : null;
  box.hidden = false;
  box.innerHTML = html`<p class="hint err">${msg}</p>${diag ? diagHTML(diag) : ''}`.s;
}
function diagHTML(text) {
  S.diagText = text;
  return html`<div class="diag"><p>${t('diagLead')}</p>
    <button class="btn small" data-act="diag-copy">${ic('paste')}<span>${t('diagCopy')}</span></button>
    <details><summary>${t('diagShow')}</summary><pre class="diag-pre">${text}</pre></details></div>`;
}
function copyDiag(el) {
  const text = S.diagText || '';
  const fallback = () => {
    const pre = el.closest('.diag')?.querySelector('pre') || $$('.diag-pre').pop();
    const d = pre?.closest('details');
    if (d) d.open = true;
    if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    toast(t('diagSelect'));
  };
  try { navigator.clipboard.writeText(text).then(() => toast(t('diagCopied')), fallback); } catch { fallback(); }
}
async function importFile(file, password) {
  const errEl = $('#imp-err');
  if (errEl) errEl.hidden = true;
  const pwSheet = sheetById('pdf-pw');
  try {
    const res = await parseImportFile(file, password);
    if (pwSheet) closeSheet(pwSheet);
    startPreview(res);
  } catch (e) {
    if (e instanceof AppError && (e.code === 'impPdfNeedPw' || e.code === 'impPdfWrongPw')) { openPdfPassword(file, e.code === 'impPdfWrongPw'); return; }
    if (pwSheet) closeSheet(pwSheet);
    importError(e);
  }
}
function openPdfPassword(file, wrong) {
  const body = err => html`<p class="lead">${t('impPdfPwLead')}</p>
    <div class="field"><input id="pdf-pw-in" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"></div>
    ${err ? html`<p class="hint err">${t('impPdfWrongPw')}</p>` : ''}
    <button class="btn primary wide" data-act="pdf-pw-go">${ic('lock')}<span>${t('impOpen')}</span></button>`;
  let rec = sheetById('pdf-pw');
  if (rec) rec.body(body(wrong));
  else rec = openSheet({ id: 'pdf-pw', title: t('impPdfPwTitle'), body: body(wrong) });
  rec.file = file;
  setTimeout(() => rec.el.querySelector('#pdf-pw-in')?.focus(), 350);
}
function startPreview(res) {
  const P = { ...res, cur: BASE, flip: false };
  buildCands(P);
  S.imp = P;
  const rec = openSheet({ id: 'imp-preview', title: res.source, tall: true, body: previewBody(P), foot: previewFoot(P) });
  rec.refresh = () => { rec.body(previewBody(P)); rec.foot(previewFoot(P)); };
  P.rec = rec;
}
function colOptions(P, field) {
  const { rows, map } = P.table;
  const width = Math.max(0, ...rows.slice(0, 30).map(r => r.length));
  const sampleRow = rows[map.headerRow + 1] || rows[0] || [];
  const opts = [];
  if (field === 'balance') opts.push([-1, t('impColNone')]);
  for (let i = 0; i < width; i++) {
    const head = map.headerRow >= 0 ? rows[map.headerRow][i] : '';
    opts.push([i, `${String.fromCharCode(65 + (i % 26))}${head ? ' · ' + head : ''}${sampleRow[i] ? ' · ' + String(sampleRow[i]).slice(0, 18) : ''}`]);
  }
  return html`${opts.map(([v, l]) => html`<option value="${v}" ${v === map[field] ? 'selected' : ''}>${l}</option>`)}`;
}
function previewBody(P) {
  if (P.diag) S.diagText = P.diag;
  const list = P.cands.filter(c => !c.dup);
  const dups = P.cands.length - list.length;
  const off = list.filter(c => c.transfer || c.pending || c.maybe).length;
  const dates = P.cands.map(c => c.date).sort();
  const allPos = P.recs.length >= 3 && P.recs.every(r => r.amount > 0);
  const colName = i => (i >= 0 ? String.fromCharCode(65 + (i % 26)) : '—');
  const notes = [];
  if (dups) notes.push(t('impDup', { n: dups }));
  if (off) notes.push(t('impUnchecked', { n: off }));
  if (allPos && !P.flip) notes.push(t('impAllPositive'));
  return html`<div class="imp-sum"><b>${t('impFound', { n: list.length })}</b>${dates.length ? html`<span>${t('impRange', { a: fmtDate(dates[0]), b: fmtDate(dates[dates.length - 1]) })}</span>` : ''}</div>
    ${notes.length ? html`<ul class="imp-notes">${notes.map(n => html`<li>${n}</li>`)}</ul>` : ''}
    <div class="imp-tools">
      <button class="chip" data-act="imp-cur"><span class="flag">${flag(P.cur)}</span>${P.cur}${ic('chevDown', 'xs')}</button>
      <button class="chip ${P.flip ? 'on' : ''}" data-act="imp-flip">${ic('exchange', 'xs')}${t('impFlip')}</button>
      <button class="chip" data-act="imp-all">${list.length && list.every(c => c.on) ? t('impNone') : t('impAll')}</button>
    </div>
    ${P.table ? html`<details class="imp-map" ${P.table.map.conf === 'low' || !P.recs.length ? 'open' : ''}><summary>${t('impMap')}<small>${t('impMapSum', { d: colName(P.table.map.date), t: colName(P.table.map.text), a: colName(P.table.map.amount) })}</small></summary>
      <label><span>${t('impColDate')}</span><select data-change="imp-map" data-f="date">${colOptions(P, 'date')}</select></label>
      <label><span>${t('impColText')}</span><select data-change="imp-map" data-f="text">${colOptions(P, 'text')}</select></label>
      <label><span>${t('impColAmt')}</span><select data-change="imp-map" data-f="amount">${colOptions(P, 'amount')}</select></label>
      <label><span>${t('impColBal')}</span><select data-change="imp-map" data-f="balance">${colOptions(P, 'balance')}</select></label></details>` : ''}
    ${list.length ? html`<ul class="imp-list">${P.cands.map((c, i) => (c.dup ? '' : impRowHTML(c, i)))}</ul>${P.diag ? html`<button class="txt-btn diag-link" data-act="diag-copy">${t('diagWrong')}</button>` : ''}`
    : P.cands.length ? html`<p class="hint">${t('impAllDup')}</p>`
    : html`<p class="hint err">${t('impNothing')}</p>${P.diag ? diagHTML(P.diag) : ''}`}`;
}
function impRowHTML(c, i) {
  const cat = catById(c.cat);
  const sign = c.type === 'expense' ? MINUS : '+';
  return html`<li class="imp-row ${c.on ? '' : 'off'}" data-i="${i}">
    <button class="ck ${c.on ? 'on' : ''}" data-act="imp-toggle" data-i="${i}" aria-pressed="${c.on}" aria-label="${c.text}">${ic('check')}</button>
    <div class="imp-main">
      <div class="imp-l1"><span class="imp-text">${c.text || '—'}</span><span class="imp-amt num ${c.type === 'income' ? 'in' : ''}">${sign}${fmtNum(c.amt, dpOf(S.imp?.cur || BASE))}</span></div>
      <div class="imp-l2"><span class="num">${fmtDate(c.date)}</span>
        ${c.transfer ? html`<span class="tag">${t('tagTransfer')}</span>` : ''}${c.pending ? html`<span class="tag">${t('tagPending')}</span>` : ''}${c.maybe ? html`<span class="tag warn">${t('tagMaybe')}</span>` : ''}
        <button class="imp-cat" data-act="imp-cat" data-i="${i}" style="--c:${cat.color}"><i></i>${catName(cat)}</button></div>
    </div></li>`;
}
function previewFoot(P) {
  const n = P.cands.filter(c => c.on && !c.dup).length;
  return html`<button class="btn primary wide" data-act="imp-confirm" ${n ? '' : 'disabled'}>${t('impGo', { n })}</button>`;
}
async function confirmImport(P) {
  const chosen = P.cands.filter(c => c.on && !c.dup);
  if (!chosen.length) { toast(t('impNoneSel')); return; }
  let rateOf = () => 1;
  if (P.cur !== BASE) {
    const ds = chosen.map(c => c.date).sort();
    rateOf = await ratesForRange(P.cur, ds[0], ds[ds.length - 1]);
    if (chosen.some(c => !(rateOf(c.date) > 0))) { toast(t('needRate')); return; }
  }
  const now = Date.now();
  const dp = dpOf(P.cur);
  const txs = chosen.map((c, i) => {
    const rate = rateOf(c.date);
    const amount = roundDp(c.amt, dp);
    return { id: uid(), type: c.type, amount, currency: P.cur, rate, base: round2(amount * rate), cat: c.cat, date: c.date, note: cleanText(c.text), src: 'import', ext: c.ext, ts: now + i, mt: now };
  });
  await db.putMany(txs);
  S.tx.push(...txs); sortTx();
  let learned = false;
  for (const c of chosen) if (c.manual && c.text) { S.rules[merchantKey(c.text)] = c.cat; learned = true; }
  if (learned) await db.set('rules', S.rules);
  closeAllSheets();
  S.imp = null; S.tab = 'home'; S.search = ''; S.searchOpen = false;
  S.month = monthOf(txs.map(x => x.date).sort().pop());
  renderApp();
  toast(t('impDone', { n: txs.length }));
}

/* ───────────────────────── actions ───────────────────────── */

const ACT = {
  tab(el) {
    const v = $('#view'); if (v) S.scroll[S.tab] = v.scrollTop;
    const to = el.dataset.tab;
    if (to === 'stats' && S.stats.mode === 'year' && S.tab !== 'stats') S.statsYear = +S.month.slice(0, 4);
    S.tab = to;
    renderView(false);
  },
  add() { openEntry(null); },
  'tx-edit'(el) { const tx = S.tx.find(x => x.id === el.dataset.id); if (tx) openEntry(tx); },
  'month-step'(el) { S.month = addMonths(S.month, +el.dataset.d); S.statsYear = +S.month.slice(0, 4); renderView(); },
  'search-toggle'() {
    S.searchOpen = !S.searchOpen; if (!S.searchOpen) S.search = '';
    renderView();
    if (S.searchOpen) $('#search-in')?.focus();
  },
  'import-open'() { openImport(); },
  'hide-install'() { S.settings.hideInstall = true; saveSettings(); renderView(); },
  'nag-later'() { S.settings.nagAt = Date.now(); saveSettings(); renderView(); },
  'sheet-close'() { closeSheet(); },
  'toast-action'() { $('#toast').classList.remove('on'); S.toastAction?.(); },
  bar(el) {
    $$('.bars .bar.sel').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
    const tip = $('#chart-tip'); if (tip) tip.textContent = el.dataset.tip;
  },
  /* stats */
  'stats-mode'(el) { S.stats.mode = el.dataset.v; if (S.stats.mode === 'year') S.statsYear = +S.month.slice(0, 4); renderView(); },
  'stats-type'(el) { S.stats.type = el.dataset.v; renderView(); },
  'stats-step'(el) {
    const d = +el.dataset.d;
    if (S.stats.mode === 'month') S.month = addMonths(S.month, d); else S.statsYear += d;
    renderView();
  },
  'cat-detail'(el) {
    const c = catById(el.dataset.cat);
    const draw = () => {
      const [from, to] = statsRange();
      const list = S.tx.filter(x => x.cat === c.id && x.date >= from && x.date <= to);
      const total = round2(list.reduce((a, x) => a + x.base, 0));
      return html`<div class="catd-sum">${tileHTML(c, 'lg')}<div><b class="num">${fmtD(total)}</b><span>${t('nEntries', { n: list.length })}</span></div></div>${groupByDate(list).map(dayGroupHTML)}`;
    };
    const rec = openSheet({ id: 'catd', title: catName(c), tall: true, left: html`<button class="txt-btn" data-act="sheet-close">${t('done')}</button>`, body: draw() });
    rec.refresh = () => rec.body(draw());
  },
  /* entry form */
  'f-type'(el) {
    if (!F || F.type === el.dataset.v) return;
    F.type = el.dataset.v;
    const lc = S.lastCat[F.type];
    F.cat = lc && S.cats.some(c => c.id === lc) ? lc : catsOf(F.type)[0]?.id;
    const sh = sheetById('entry');
    sh.el.querySelectorAll('[data-act="f-type"]').forEach(b => { const on = b.dataset.v === F.type; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#f-cats').innerHTML = catGridHTML().s;
    $('#kp').innerHTML = keypadHTML().s;
    updAmount();
  },
  'f-cat'(el) {
    if (!F) return;
    F.cat = el.dataset.id;
    $$('#f-cats .cat').forEach(b => { const on = b.dataset.id === F.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  },
  'f-cat-new'() {
    if (!F) return;
    openCatEditor({ type: F.type }, c => { if (F) { F.cat = c.id; $('#f-cats').innerHTML = catGridHTML().s; } });
  },
  'f-cur'() {
    if (!F) return;
    openCurrencySheet(F.cur, c => {
      if (!F || c === F.cur) return;
      const dpChanged = dpOf(c) !== dpOf(F.cur);
      F.cur = c; F.rateManual = false;
      if (dpChanged) { F.expr = F.expr ? trimNum(evalExpr(F.expr), dpOf(c)) : ''; $('#kp').innerHTML = keypadHTML().s; }
      loadRate();
    });
  },
  'f-rate'() { if (F && F.cur !== BASE) openRateSheet(); },
  kp(el) { if (F) kpPress(el.dataset.k); },
  'kp-save'() { if (F) saveEntry().catch(e => { console.error(e); toast(String(e?.message || e)); }); },
  async 'f-delete'() {
    if (!F?.orig) return;
    if (!await confirmDialog({ title: t('delTitle'), message: t('delMsg'), ok: t('delete'), danger: true })) return;
    const id = F.orig.id;
    await db.del(id);
    S.tx = S.tx.filter(x => x.id !== id);
    closeSheet(sheetById('entry'));
    refreshAll();
    toast(t('deleted'));
  },
  'rate-save'() {
    const v = parseAmount($('#rate-in')?.value);
    if (!(v > 0)) { toast(t('rateInvalid')); shake('#rate-in'); return; }
    F.rate = v; F.rateManual = true; F.rateDate = null;
    closeSheet(sheetById('rate')); updAmount();
  },
  async 'rate-latest'() {
    try {
      const L = await ensureLatestRates(true);
      const r = L?.rates?.[F.cur];
      if (!r) throw new Error('no rate');
      F.rate = r; F.rateDate = L.date; F.rateManual = false;
      closeSheet(sheetById('rate')); updAmount(); toast(t('rateUpdated'));
    } catch { toast(t('rateFail')); }
  },
  'cur-pick'(el) { const c = el.dataset.c, fn = S.curPick; closeSheet(sheetById('cur')); fn?.(c); },
  /* categories */
  'cat-color'(el) { const rec = sheetById('cat-edit'); rec.E.name = $('#cat-name').value; rec.E.color = el.dataset.c; rec.draw(); },
  'cat-icon'(el) { const rec = sheetById('cat-edit'); rec.E.name = $('#cat-name').value; rec.E.icon = el.dataset.i; rec.draw(); },
  'cat-save'() { const rec = sheetById('cat-edit'); rec.E.name = $('#cat-name').value; saveCat(rec); },
  'cat-delete'() { deleteCat(sheetById('cat-edit')); },
  'cats-open'() { openCatsManager(); },
  'cm-type'(el) { sheetById('cats')?.setType(el.dataset.v); },
  'cm-edit'(el) { const c = S.cats.find(x => x.id === el.dataset.id); if (c) openCatEditor(c); },
  'cm-new'() { openCatEditor({ type: sheetById('cats')?.type() || 'expense' }); },
  /* budget */
  'budget-edit'() { openBudgetSheet(null); },
  'catbudget-edit'(el) { openBudgetSheet(el.dataset.cat); },
  'catbudget-add'() {
    openCatPicker('expense', Object.keys(S.budget.cats || {}), id => openBudgetSheet(id));
  },
  catpick(el) { const rec = sheetById('catpick'); const fn = rec?.onPick; closeSheet(rec); fn?.(el.dataset.id); },
  async 'budget-save'() {
    const rec = sheetById('budget');
    const v = parseAmount($('#budget-in')?.value);
    if (!(v > 0)) { toast(t('amountInvalid')); shake('#budget-in'); return; }
    if (rec.catId) S.budget.cats[rec.catId] = round2(v); else S.budget.total = round2(v);
    await db.set('budget', S.budget);
    closeSheet(rec); refreshAll(); toast(t('budgetSaved'));
  },
  async 'budget-remove'() {
    const rec = sheetById('budget');
    if (rec.catId) delete S.budget.cats[rec.catId]; else S.budget.total = null;
    await db.set('budget', S.budget);
    closeSheet(rec); refreshAll(); toast(t('budgetRemoved'));
  },
  /* settings */
  'set-theme'(el) { S.settings.theme = el.dataset.v; saveSettings(); applyTheme(); renderView(); },
  'set-disp'(el) { setDisplay(el.dataset.v); },
  'disp-open'() { openDispPicker(); },
  'disp-pick'(el) { setDisplay(el.dataset.c); },
  'disp-other'() { openCurrencySheet(dispCur(), c => setDisplay(c)); },
  'set-palette'(el) { S.settings.palette = el.dataset.v; saveSettings(); applyPalette(); renderView(); },
  'set-icon'(el) {
    const v = el.dataset.v, changed = v !== (PALETTES.includes(S.settings.icon) ? S.settings.icon : S.settings.palette);
    S.settings.icon = v; saveSettings(); applyPalette(); renderView();
    if (changed && isStandalone() && !DEMO) openIconSteps();
  },
  'icon-steps'() { openIconSteps(); },
  'reload-app'() { location.reload(); },
  'safari-later'() { S.settings.safariNagAt = Date.now(); saveSettings(); renderView(); },
  'set-lang'(el) { S.settings.lang = el.dataset.v; saveSettings(); applyLang(); renderApp(); },
  'pin-change'() { changePin(); },
  'backup-export'() { if (DEMO) { toast(t('demoNoFile')); return; } openBackupExport(); },
  'bk-make'() { makeBackup(sheetById('backup')); },
  'bk-save'() { saveBackupFile(sheetById('backup')); },
  'backup-restore'() { if (DEMO) { toast(t('demoNoFile')); return; } pickFile(f => startRestore(f).catch(e => { console.error(e); toast(t('notBackup')); })); },
  'rs-go'() { runRestore(sheetById('restore')); },
  'csv-export'() { if (DEMO) { toast(t('demoNoFile')); return; } exportCSV(); },
  'erase-all'() { eraseAll(); },
  async 'rates-refresh'(el) {
    el.classList.add('busy-row');
    try { await ensureLatestRates(true); toast(t('rateUpdated')); } catch { toast(t('rateFail')); }
    renderView();
  },
  /* lock */
  'lock-face'() { lockFace(); },
  'lock-pinmode'() { S.lockUI.mode = 'pin'; S.lockUI.msg = ''; renderLock(); },
  'lock-pin'(el) { lockPinPress(el.dataset.k); },
  'setup-pin'(el) { sheetById('pin-setup')?.press(el.dataset.k); },
  'verify-pin'(el) { sheetById('verify')?.press(el.dataset.k); },
  'verify-face'() { sheetById('verify')?.face(); },
  /* import */
  'imp-file'() { pickFile(f => importFile(f)); },
  'pdf-pw-go'() {
    const rec = sheetById('pdf-pw');
    const pw = $('#pdf-pw-in')?.value || '';
    if (rec && pw) importFile(rec.file, pw);
  },
  'diag-copy'(el) { copyDiag(el); },
  'imp-paste'() { const box = $('#imp-paste-box'); box.hidden = !box.hidden; if (!box.hidden) $('#imp-text').focus(); },
  'imp-paste-go'() {
    const txt = $('#imp-text')?.value || '';
    if (!txt.trim()) { toast(t('impPasteEmpty')); return; }
    try { startPreview(parseText(txt, t('srcText'))); } catch (e) { importError(e); }
  },
  'imp-toggle'(el) {
    const P = S.imp, c = P?.cands[+el.dataset.i];
    if (!c) return;
    c.on = !c.on;
    el.classList.toggle('on', c.on); el.setAttribute('aria-pressed', c.on);
    el.closest('.imp-row').classList.toggle('off', !c.on);
    P.rec.foot(previewFoot(P));
  },
  'imp-all'() { const P = S.imp; const list = P.cands.filter(c => !c.dup); const all = list.every(c => c.on); list.forEach(c => { c.on = !all; }); P.rec.refresh(); },
  'imp-flip'() { const P = S.imp; P.flip = !P.flip; buildCands(P); P.rec.refresh(); },
  'imp-cur'() {
    const P = S.imp;
    openCurrencySheet(P.cur, c => { P.cur = c; buildCands(P); P.rec.refresh(); });
  },
  'imp-cat'(el) {
    const P = S.imp, c = P.cands[+el.dataset.i];
    openCatPicker(c.type, [], id => {
      c.cat = id; c.manual = true;
      const key = merchantKey(c.text);
      for (const o of P.cands) if (o !== c && !o.manual && o.type === c.type && merchantKey(o.text) === key) o.cat = id;
      P.rec.refresh();
    });
  },
  'imp-confirm'(el) { el.disabled = true; confirmImport(S.imp).catch(e => { console.error(e); toast(String(e?.message || e)); el.disabled = false; }); },
};
const INPUT = {
  search(el) { S.search = el.value; const b = $('#home-body'); if (b) b.innerHTML = homeBody().s; },
  'f-note'(el) { if (F) F.note = el.value; },
  'cur-q'(el) { const l = $('#cur-list'); if (l) l.innerHTML = curListHTML(el.value).s; },
  'cat-name'(el) { const rec = sheetById('cat-edit'); if (rec) rec.E.name = el.value; },
};
const CHANGE = {
  'month-pick'(el) { if (/^\d{4}-\d{2}$/.test(el.value)) { S.month = el.value; S.statsYear = +el.value.slice(0, 4); renderView(); } },
  'f-date'(el) {
    if (!F) return;
    F.date = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : todayStr();
    $('#f-date-l').textContent = fmtDayShort(F.date);
    if (F.cur !== BASE && !F.rateManual) loadRate();
    else if (F.cur !== BASE && F.orig && F.orig.date !== F.date) loadRate();
  },
  'lock-toggle'(el) { if (el.checked) enableLock(); else disableLock(); },
  'lock-delay'(el) { S.settings.lock.delay = +el.value; saveSettings(); renderView(); },
  'imp-map'(el) {
    const P = S.imp;
    P.table.map[el.dataset.f] = +el.value;
    P.table.map.conf = 'user';
    if (el.dataset.f === 'date') P.table.map.ctx = detectDateCtx(P.table.rows.slice(P.table.map.headerRow + 1).map(r => r[P.table.map.date]), P.table.rows.slice(0, 80).flat().join(' '));
    P.recs = recsFromTable(P.table);
    buildCands(P); P.rec.refresh();
  },
};

/* ───────────────────────── theme, language, lifecycle ───────────────────────── */

const HOST_THEME = document.documentElement.dataset.theme;
function applyPalette() {
  const p = PALETTES.includes(S.settings.palette) ? S.settings.palette : 'harbor';
  document.documentElement.dataset.palette = p;
  const icon = PALETTES.includes(S.settings.icon) ? S.settings.icon : p;
  const link = $('link[rel="apple-touch-icon"]');
  if (link) link.href = `icons/${icon}-180.png`;
  const cover = $('#cover');
  if (cover) cover.innerHTML = themeMark().s;
  applyTheme();
}
function applyTheme() {
  const th = S.settings.theme;
  if (DEMO && th === 'system') { if (HOST_THEME) document.documentElement.dataset.theme = HOST_THEME; else delete document.documentElement.dataset.theme; }
  else document.documentElement.dataset.theme = th;
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', bg));
  });
}
function applyLang() {
  const pref = S.settings.lang;
  LANG = pref === 'zh' || pref === 'en' ? pref : ((navigator.languages?.[0] || navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en');
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
}
function bindGlobal() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    try { const r = fn(el, e); if (r?.catch) r.catch(err => { console.error(err); toast(String(err?.message || err)); }); } catch (err) { console.error(err); toast(String(err?.message || err)); }
  });
  document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) INPUT[el.dataset.input]?.(el, e); });
  document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) CHANGE[el.dataset.change]?.(el, e); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheets.length) closeSheet();
    if (e.key === 'Enter' && e.target.id === 'f-note') e.target.blur();
    if (e.key === 'Enter' && e.target.id === 'pdf-pw-in') { e.preventDefault(); ACT['pdf-pw-go'](); }
  });
  document.addEventListener('touchstart', () => {}, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      S.hiddenAt = Date.now();
      if (S.settings.lock.on && !DEMO) $('#cover').classList.add('on');
      return;
    }
    const away = Date.now() - (S.hiddenAt || Date.now());
    const external = Date.now() < S.extUntil;
    if (S.settings.lock.on && !S.locked && !external && away >= S.settings.lock.delay * 1000) lockApp();
    $('#cover').classList.remove('on');
    if (!S.locked && navigator.onLine) ensureLatestRates().catch(() => {});
    checkForUpdate();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  window.addEventListener('online', () => { if (!S.locked) ensureLatestRates().catch(() => {}); checkForUpdate(); });
}
function registerSW() {
  if (DEMO || !('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => { S.swReg = reg; setTimeout(() => checkForUpdate(true), 4000); })
    .catch(e => console.warn('SW', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || S.reloading) return;
    // Right after launch with nothing open, switch to the new version straight away.
    if (Date.now() - BOOT_AT < 8000 && !sheets.length && !S.settings.lock.on) { S.reloading = true; location.reload(); return; }
    S.updateReady = true;
    if (!S.locked) { renderView(); toast(t('updateReady'), { action: t('reload'), onAction: () => location.reload(), ms: 8000 }); }
  });
}
// A Home Screen app resumed from the background does not look for updates by itself.
function checkForUpdate(force = false) {
  if (!S.swReg || !navigator.onLine) return;
  if (!force && Date.now() - (S.updateCheckedAt || 0) < 60e3) return;
  S.updateCheckedAt = Date.now();
  S.swReg.update().catch(() => {});
}

/* ───────────────────────── demo data (preview build only) ───────────────────────── */

function seedDemo() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const rates = { SEK: 1, CNY: 1.318, EUR: 10.94, USD: 9.43, GBP: 12.61, NOK: 0.934, DKK: 1.466, JPY: 0.0626, HKD: 1.213, KRW: 0.00681, CHF: 11.72, THB: 0.283 };
  S.rates = { latest: { date: addDays(todayStr(), -1), rates, fetchedAt: Date.now() }, hist: {} };
  S.cats = DEFAULT_CATS.map(c => ({ ...c }));
  const tx = [];
  const add = (date, type, cat, amount, note, currency = BASE) => {
    const rate = rates[currency];
    tx.push({ id: uid(), type, amount, currency, rate, base: round2(amount * rate), cat, date, note, src: 'manual', ts: Date.now() - tx.length, mt: Date.now() });
  };
  const today = todayStr();
  const start = addMonths(monthOf(today), -3) + '-01';
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = +d.slice(8), wd = parseYmd(d).getDay();
    if (day === 1) add(d, 'expense', 'e_housing', 4950, 'SGS Studentbostäder');
    if (day === 2) add(d, 'income', 'i_allowance', 6000, '家里转账', 'CNY');
    if (day === 25) add(d, 'income', 'i_parttime', 2400, 'Chalmers TA');
    if (day === 3) add(d, 'expense', 'e_transport', 470, 'Västtrafik 30 dagar');
    if (day === 5) add(d, 'expense', 'e_utilities', 199, 'Hallon');
    if (day === 12) add(d, 'expense', 'e_subs', 59, 'Spotify Student');
    if (wd === 6 || wd === 3) add(d, 'expense', 'e_groceries', Math.round(180 + rnd() * 340), pick(['ICA Maxi Lindholmen', 'Willys Göteborg', 'Lidl Hjalmar', 'Coop Avenyn']));
    if (wd >= 1 && wd <= 5 && rnd() < 0.55) add(d, 'expense', 'e_food', pick([75, 82, 89, 95]), pick(['Kårrestaurangen', 'Linsen', 'Wijkanders']));
    if (rnd() < 0.18) add(d, 'expense', 'e_food', Math.round(45 + rnd() * 30), pick(['Espresso House', 'Café Bulleriet']));
    if (rnd() < 0.05) add(d, 'expense', 'e_shopping', Math.round(149 + rnd() * 450), pick(['H&M', 'IKEA Bäckebol', 'Clas Ohlson']));
    if (rnd() < 0.035) add(d, 'expense', 'e_fun', pick([145, 165, 320]), pick(['Filmstaden Bergakungen', 'Liseberg']));
    if (rnd() < 0.02) add(d, 'expense', 'e_shopping', Math.round(80 + rnd() * 300), '淘宝', 'CNY');
    if (rnd() < 0.02) add(d, 'expense', 'e_health', Math.round(60 + rnd() * 120), 'Apotek Hjärtat');
  }
  add(addDays(today, -40), 'expense', 'e_travel', 39.9, 'Deutsche Bahn', 'EUR');
  S.tx = tx; sortTx();
  S.budget = { total: 13500, cats: { e_food: 1800, e_groceries: 2600, e_shopping: 1200 } };
}

/* ───────────────────────── boot ───────────────────────── */

async function boot() {
  await db.open();
  const st = await db.get('settings');
  S.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(st || {}) };
  S.settings.lock = { ...DEFAULT_SETTINGS.lock, ...(st?.lock || {}) };
  applyLang();
  document.documentElement.style.setProperty('--guilloche', noteArtURL());
  applyPalette();
  bindGlobal();
  registerSW();
  if (!DEMO) {
    try {
      navigator.storage?.persist?.().then(ok => { S.persisted = !!ok; if (!S.locked && S.tab === 'settings') renderView(); }).catch(() => {});
    } catch { /* not allowed here */ }
  }
  if (DEMO) seedDemo(); else await loadData();
  document.body.classList.add('ready');
  if (S.settings.lock.on && !DEMO) {
    lockApp();
    if (S.settings.lock.credId) lockFace();
  } else {
    renderApp();
    ensureLatestRates().then(() => { if (S.tab === 'settings' || S.settings.display !== BASE) renderView(); }).catch(() => {});
  }
}
boot().catch(e => {
  console.error(e);
  document.body.classList.add('ready');
  $('#app').innerHTML = html`<div class="fatal"><p>${String(e?.message || e)}</p></div>`.s;
});
