// ============================================================
//  人生模拟器 · 数据层 (data.js)
//  统计属性、姓名库、家庭、阶段、以及大量人生事件。
//  纯数据，不含 DOM 操作，方便预览与测试。
// ============================================================

"use strict";

const LIFE = {};

// ---- 统计属性定义 ----
LIFE.STATS = [
  { key: "iq",     name: "智力", icon: "🧠", color: "#6d7fd4", max: 100, init: 50 },
  { key: "eq",     name: "情商", icon: "🤝", color: "#4fa3a5", max: 100, init: 50 },
  { key: "health", name: "体质", icon: "💪", color: "#6aa84f", max: 100, init: 60 },
  { key: "looks",  name: "颜值", icon: "✨", color: "#d98ba1", max: 100, init: 50 },
  { key: "wealth", name: "财富", icon: "💰", color: "#c9903d", max: 100, init: 30 },
  { key: "happy",  name: "幸福", icon: "🙂", color: "#e0a04a", max: 100, init: 60 },
];

LIFE.STAT_BY_KEY = {};
LIFE.STATS.forEach((s) => { LIFE.STAT_BY_KEY[s.key] = s; });

// ---- 姓名库 ----
LIFE.NAMES_MALE = [
  "李晨","王浩","张伟","刘洋","陈明","杨帆","赵磊","黄宇","周杰","吴凡",
  "徐涛","孙鹏","马超","朱轩","胡斌","郭煦","林风","何俊","高畅","罗云",
  "郑凯","梁宵","谢宁","宋言","唐睿","韩冬","冯澈","董然","萧然","程远",
];
LIFE.NAMES_FEMALE = [
  "林雨","苏晴","陈曦","李梦","王瑶","张蕊","刘婉","杨雪","赵月","黄娟",
  "周颖","吴悠","徐婷","孙萌","马兰","朱蕊","胡欣","郭莜","何念","高璇",
  "罗妤","郑霜","梁语","谢怡","宋绵","唐静","韩悦","冯芊","董婉","程芷",
];

// ---- 家庭背景 ----
LIFE.FAMILIES = [
  { id: "poor", name: "贫寒", tag: "寒门", wealth: 15, val: { iq: -2, eq: +3, health: +3 }, desc: "从小在穷困中长大，却练就了坚韧的意志。" },
  { id: "normal", name: "普通", tag: "平凡", wealth: 32, val: { iq: 0, eq: 0, health: 0 }, desc: "一个再普通不过的家庭，一切靠自己。" },
  { id: "rich", name: "富裕", tag: "优渥", wealth: 58, val: { iq: +3, eq: +3, health: -2 }, desc: "含着金汤匙出生，资源优渥但少了些磨砺。" },
];

// ---- 人生阶段（按年龄划分） ----
LIFE.STAGES = [
  { from: 0,  to: 5,   name: "幼儿期", tag: "👶 幼儿" },
  { from: 6,  to: 12,  name: "童年",   tag: "🎒 童年" },
  { from: 13, to: 18,  name: "少年",   tag: "📚 少年" },
  { from: 19, to: 24,  name: "青年",   tag: "🎓 青年" },
  { from: 25, to: 40,  name: "成年",   tag: "💼 成年" },
  { from: 41, to: 59,  name: "中年",   tag: "🧭 中年" },
  { from: 60, to: 79,  name: "中老年", tag: "🍵 中老年" },
  { from: 80, to: 120, name: "老年",   tag: "🍂 老年" },
];

LIFE.getStage = function (age) {
  for (const s of LIFE.STAGES) if (age >= s.from && age <= s.to) return s;
  return LIFE.STAGES[LIFE.STAGES.length - 1];
};

// ---- 随机事件库 ----
// 每个事件：{ id, stage:[阶段名或范围], weight, cond?: 前置函数, text, effects, choices? }
// effect 形式: { iq:+1, wealth:-5 } 或 { health:-20 }，值会加到对应属性。
// choice: { label, text, effects, cond? }
// 阶段用 id 或年龄区间(如 {from:6,to:18})指定。
LIFE.EVENTS = [
  // ===== 幼儿期 (0-5) =====
  {
    id: "baby_walk", stage: { from: 1, to: 4 }, weight: 60,
    text: "你迈出了人生第一步，摇摇晃晃地扑进家人怀里。",
    choices: [
      { label: "自信地走", text: "你胆子很大，摔倒了也自己爬起来。", effects: { eq: -3, health: +4 } },
      { label: "小心谨慎", text: "你更愿意扶着墙慢慢挪，小心翼翼。", effects: { eq: +5, health: -1 } },
    ],
  },
  {
    id: "baby_word", stage: { from: 0, to: 3 }, weight: 70,
    text: "你说出了人生第一个词。",
    choices: [
      { label: "叫“妈妈”", text: "妈妈高兴得眼眶都红了。", effects: { eq: +4, happy: +4 } },
      { label: "叫“爸爸”", text: "爸爸笑得合不拢嘴。", effects: { eq: +4, happy: +4 } },
      { label: "直接喊全名", text: "全家人惊呆了：这孩子天生就很特别。", effects: { iq: +6, eq: -2 } },
    ],
  },
  {
    id: "baby_sick", stage: { from: 0, to: 5 }, weight: 35,
    text: "你生了场大病，发高烧好几天。",
    choices: [
      { label: "坚强扛过去", text: "你顽强地挺了过来，免疫力变得更好了。", effects: { health: +5, happy: -2 } },
      { label: "家人悉心照料", text: "在家人照料下，你恢复了健康。", effects: { health: +2, eq: +3 } },
    ],
  },
  {
    id: "baby_gift", stage: { from: 2, to: 6 }, weight: 45,
    text: "亲戚送你一个玩具。",
    choices: [
      { label: "拆个稀巴烂", text: "你把玩具拆成了零件，好奇心爆棚。", effects: { iq: +5 } },
      { label: "一直抱着", text: "你把它当作宝贝，学会珍惜。", effects: { eq: +5 } },
    ],
  },
  {
    id: "baby_family_rich", stage: { from: 0, to: 5 }, weight: 25, cond: (g) => g.family && g.family.id === "rich",
    text: "家里请来专业早教老师，为你启蒙。",
    choices: [
      { label: "认真学", text: "你学得飞快，早早展露天赋。", effects: { iq: +6, happy: -1 } },
      { label: "撒泼打滚", text: "你一点都不想学，只想玩。", effects: { iq: -3, happy: +5 } },
    ],
  },
  {
    id: "baby_lonely", stage: { from: 0, to: 5 }, weight: 20,
    text: "父母忙于生计，常常把你一个人留在家里。",
    choices: [
      { label: "学会独处", text: "你在安静中养成了爱思考的习惯。", effects: { iq: +6, eq: -4, happy: -4 } },
      { label: "感到孤单", text: "你幼小的心灵里埋下了不安。", effects: { eq: +4, happy: -8 } },
    ],
  },

  // ===== 童年 (6-12) =====
  {
    id: "child_school", stage: { from: 6, to: 12 }, weight: 80,
    text: "你开始上小学了。",
    choices: [
      { label: "努力学习", text: "你成绩名列前茅，老师常夸你。", effects: { iq: +6 } },
      { label: "贪玩逃课", text: "你把时间都花在游戏和玩耍上。", effects: { iq: -5, happy: +5 } },
      { label: "当班长", text: "你社交能力出众，人缘极好。", effects: { eq: +6, health: -2 } },
    ],
  },
  {
    id: "child_reading", stage: { from: 6, to: 12 }, weight: 55,
    text: "你在书架上发现了一本有趣的课外书。",
    choices: [
      { label: "读得入迷", text: "你爱上了阅读，眼界大开。", effects: { iq: +7, happy: +3 } },
      { label: "翻两页就丢", text: "书太无聊了，你更想出去玩。", effects: { iq: -2, health: +3, happy: +3 } },
    ],
  },
  {
    id: "child_sport", stage: { from: 6, to: 12 }, weight: 45,
    text: "学校举办运动会，你被老师拉去参赛。",
    choices: [
      { label: "拼命跑", text: "你拿了名次，身体越来越棒。", effects: { health: +7, happy: +3 } },
      { label: "算了不跑了", text: "你不想让同学看你自己出丑。", effects: { health: -1, eq: -3, happy: -3 } },
    ],
  },
  {
    id: "child_bully", stage: { from: 7, to: 12 }, weight: 35,
    text: "有同学欺负你，抢走你的文具。",
    choices: [
      { label: "勇敢反抗", text: "你学会了保护自己，也变得更强。", effects: { health: +3, eq: +4 } },
      { label: "向老师告状", text: "老师出面解决了问题，你学会求助。", effects: { eq: +3, health: -2 } },
      { label: "默默忍受", text: "你把委屈憋在心里，很久都不快乐。", effects: { eq: -5, happy: -8 } },
    ],
  },
  {
    id: "child_pet", stage: { from: 6, to: 12 }, weight: 30,
    text: "你捡到一只流浪猫/流浪狗。",
    choices: [
      { label: "偷偷养起来", text: "你有了最好的伙伴，学会了爱。", effects: { eq: +7, happy: +6, health: -1 } },
      { label: "送给别人", text: "你虽舍不得，但知道养不起它。", effects: { eq: -3, happy: -3 } },
    ],
  },
  {
    id: "child_hobby", stage: { from: 8, to: 12 }, weight: 40,
    text: "你在某个兴趣班崭露头角。",
    choices: [
      { label: "画画", text: "你的画作被老师贴在墙上展览。", effects: { iq: +3, eq: +5, happy: +4 } },
      { label: "钢琴", text: "你弹得越来越好，气质出众。", effects: { iq: +4, looks: +2, eq: +4 } },
      { label: "编程", text: "你写出了人生第一段代码！", effects: { iq: +8 } },
    ],
  },

  // ===== 少年 (13-18) =====
  {
    id: "teen_exam", stage: { from: 13, to: 18 }, weight: 85,
    text: "初三/高三的升学考试临近，压力山大。",
    choices: [
      { label: "拼命刷题", text: "你几乎通宵达旦，只为考出好成绩。", effects: { iq: +8, health: -8, happy: -6 } },
      { label: "劳逸结合", text: "你把握好了学习与休息的平衡。", effects: { iq: +4, health: +2, happy: +3 } },
      { label: "无所谓", text: "你觉得成绩说明不了什么。", effects: { iq: -6, eq: +2, happy: +2 } },
    ],
  },
  {
    id: "teen_crush", stage: { from: 13, to: 18 }, weight: 50,
    text: "你偷偷喜欢上了班上的一个同学。",
    choices: [
      { label: "勇敢表白", text: "虽然失败了，但你学会了表达情感。", effects: { eq: +6, happy: -4, looks: +2 } },
      { label: "藏在心里", text: "你把这份悸动锁在日记里。", effects: { eq: -2, happy: +2, iq: +2 } },
    ],
  },
  {
    id: "teen_rebel", stage: { from: 13, to: 18 }, weight: 35,
    text: "你进入了叛逆期，和父母频繁争吵。",
    choices: [
      { label: "冷静沟通", text: "你试着理解父母，也让他们理解你。", effects: { eq: +6, happy: +3, iq: +2 } },
      { label: "摔门而去", text: "矛盾加深，你更加倔强。", effects: { eq: -5, happy: -5, health: -2 } },
    ],
  },
  {
    id: "teen_friend", stage: { from: 13, to: 18 }, weight: 45,
    text: "你交到了一个无话不谈的好朋友。",
    choices: [
      { label: "真心相待", text: "这段友谊成为你青春里最亮的光。", effects: { eq: +7, happy: +7 } },
      { label: "保持距离", text: "你更习惯独来独往。", effects: { eq: -3, iq: +3, happy: -2 } },
    ],
  },
  {
    id: "teen_game", stage: { from: 13, to: 18 }, weight: 30,
    text: "你沉迷进了游戏世界，无法自拔。",
    choices: [
      { label: "适度游玩", text: "游戏成了你放松的调剂。", effects: { iq: +2, happy: +5 } },
      { label: "彻底沉迷", text: "成绩一落千丈，你几乎荒废学业。", effects: { iq: -10, happy: +8, health: -6 } },
    ],
  },
  {
    id: "teen_art", stage: { from: 15, to: 18 }, weight: 30,
    text: "你决定走艺考/特长生路线。",
    choices: [
      { label: "坚持梦想", text: "你为热爱付出了全部努力。", effects: { iq: +3, eq: +6, looks: +4, health: -4 } },
      { label: "听父母的话", text: "你放弃了爱好，回归理科。", effects: { iq: +8, eq: -5, happy: -6 } },
    ],
  },

  // ===== 青年 (19-24) =====
  {
    id: "youth_university", stage: { from: 19, to: 24 }, weight: 80,
    text: "你考上了大学，即将开启新生活。",
    choices: [
      { label: "读名校热门专业", text: "你进了顶尖学府，前途光明。", effects: { iq: +8, wealth: +5, happy: -2 } },
      { label: "读普通大学", text: "日子平淡，但你学会了随遇而安。", effects: { iq: +4, eq: +3 } },
      { label: "没考上", text: "你要么复读，要么提前进入社会。", effects: { iq: -6, wealth: -5, eq: +5, health: +3 } },
    ],
  },
  {
    id: "youth_love", stage: { from: 18, to: 24 }, weight: 45,
    text: "你在大学里遇到了心动的 TA。",
    choices: [
      { label: "开始恋爱", text: "校园恋爱甜甜的，却也耗费精力。", effects: { eq: +8, happy: +10, iq: -3 } },
      { label: "专注学业", text: "你把心思都放在提升自己上。", effects: { iq: +8, eq: -4 } },
    ],
  },
  {
    id: "youth_parttime", stage: { from: 19, to: 24 }, weight: 40,
    text: "你找了一份兼职来赚零花钱。",
    choices: [
      { label: "家教", text: "你边教边学，能力提升很快。", effects: { wealth: +6, iq: +4, health: -2 } },
      { label: "送外卖", text: "风吹日晒，但赚得实在。", effects: { wealth: +7, health: -4, eq: +3 } },
      { label: "不做兼职", text: "你把时间留给学习和自己。", effects: { iq: +5, wealth: -3 } },
    ],
  },
  {
    id: "youth_business", stage: { from: 20, to: 24 }, weight: 22,
    text: "你萌生了创业的念头。",
    choices: [
      { label: "大胆创业", text: "你拉上几人同学，说干就干。", effects: { iq: +5, eq: +5, wealth: +8, happy: -6 } },
      { label: "先求稳", text: "你决定先积累经验和人脉。", effects: { eq: +4, wealth: -3, iq: +3 } },
    ],
  },
  {
    id: "youth_travel", stage: { from: 18, to: 24 }, weight: 30,
    text: "你背上背包，来了一场说走就走的旅行。",
    choices: [
      { label: "穷游到底", text: "你见识了更广阔的天地。", effects: { eq: +7, happy: +8, wealth: -6 } },
      { label: "安稳待在家", text: "你把时间留给了舒适区。", effects: { iq: -2, happy: +2 } },
    ],
  },

  // ===== 成年 (25-40) =====
  {
    id: "adult_career", stage: { from: 25, to: 40 }, weight: 85,
    text: "你进入职场，开始打拼事业。",
    choices: [
      { label: "进大厂拿高薪", text: "996 的高压让你收入可观。", effects: { wealth: +10, health: -8, happy: -4 } },
      { label: "去体制内", text: "稳定但成长较慢，胜在安稳。", effects: { wealth: +5, eq: +4, health: +2, happy: +2 } },
      { label: "自由职业", text: "时间自由，但收入起伏大。", effects: { wealth: -2, eq: +6, happy: +6, health: +2 } },
    ],
  },
  {
    id: "adult_marriage", stage: { from: 25, to: 45 }, weight: 50,
    text: "你遇到了值得共度一生的人。",
    choices: [
      { label: "步入婚姻", text: "你们组建了温暖的小家。", effects: { eq: +8, happy: +12, wealth: -6 } },
      { label: "先拼事业", text: "你选择先立业再成家。", effects: { wealth: +8, eq: -5, happy: -4 } },
    ],
  },
  {
    id: "adult_baby", stage: { from: 26, to: 45 }, weight: 40,
    text: "家里添了一个小生命。",
    choices: [
      { label: "悉心抚养", text: "养娃虽累，但你甘之如饴。", effects: { eq: +6, happy: +10, wealth: -10, health: -5 } },
      { label: "交给老人带", text: "你有了更多时间工作，却少了陪伴。", effects: { wealth: +8, eq: -6, happy: -4 } },
    ],
  },
  {
    id: "adult_promote", stage: { from: 28, to: 45 }, weight: 45,
    text: "公司有一个晋升的机会摆在你面前。",
    choices: [
      { label: "奋力争取", text: "你主动请缨，接下了重任。", effects: { wealth: +12, iq: +5, health: -6, happy: -3 } },
      { label: "保持现状", text: "你觉得现在的节奏就挺好。", effects: { happy: +5, wealth: -5 } },
    ],
  },
  {
    id: "adult_invest", stage: { from: 25, to: 55 }, weight: 35,
    text: "你手上有些闲钱，朋友劝你投资。",
    choices: [
      { label: "all in 股票", text: "行情大涨，你赚了一笔。", effects: { wealth: +15, happy: +6 } },
      { label: "买稳健理财", text: "收益不多，但胜在安全。", effects: { wealth: +6 } },
      { label: "被人割韭菜", text: "你听信‘内幕’，亏得血本无归。", effects: { wealth: -18, happy: -8 } },
    ],
  },
  {
    id: "adult_home", stage: { from: 28, to: 55 }, weight: 40,
    text: "你要在工作的城市买房安家。",
    choices: [
      { label: "砸锅卖铁上车", text: "背上了沉重的房贷，但有家了。", effects: { wealth: -15, happy: -4, eq: +3 } },
      { label: "租房也不错", text: "你更看重生活的自由。", effects: { wealth: +8, happy: +5 } },
    ],
  },

  // ===== 中年 (41-59) =====
  {
    id: "mid_burnout", stage: { from: 41, to: 59 }, weight: 45,
    text: "高强度的生活让你接近 burnout。",
    choices: [
      { label: "停下休息", text: "你放下工作，好好喘了口气。", effects: { health: +8, happy: +6, wealth: -6 } },
      { label: "咬牙硬撑", text: "你以为撑着撑着就过去了。", effects: { health: -12, wealth: +6 } },
    ],
  },
  {
    id: "mid_crisis", stage: { from: 40, to: 59 }, weight: 40,
    text: "人到中年，你遭遇了中年危机。",
    choices: [
      { label: "重新出发", text: "你决定转型，活出第二种人生。", effects: { iq: +4, eq: +6, happy: +4, wealth: -5 } },
      { label: "随遇而安", text: "你把日子过成了温水。", effects: { happy: +2, wealth: -3, eq: +2 } },
      { label: "陷入内耗", text: "你夜夜难眠，焦虑缠身。", effects: { health: -10, happy: -10 } },
    ],
  },
  {
    id: "mid_family", stage: { from: 41, to: 59 }, weight: 40,
    text: "父母年纪大了，需要你照顾。",
    choices: [
      { label: "接来同住", text: "你尽孝膝下，亲情更浓。", effects: { eq: +8, happy: +4, wealth: -8, health: -4 } },
      { label: "请护工", text: "你把照顾交给专业的人。", effects: { wealth: -10, eq: -4, happy: -2 } },
    ],
  },
  {
    id: "mid_kid_grow", stage: { from: 41, to: 59 }, weight: 40,
    text: "你的孩子长大了，面临升学/人生选择。",
    choices: [
      { label: "尊重孩子意愿", text: "你放手让孩子自己走。", effects: { eq: +7, happy: +5, wealth: -4 } },
      { label: "替他们做主", text: "你替孩子规划了‘正确’的人生。", effects: { iq: +3, eq: -6, happy: -4 } },
    ],
  },
  {
    id: "mid_side", stage: { from: 41, to: 59 }, weight: 30,
    text: "你培养了一个拿得出手的业余爱好。",
    choices: [
      { label: "钓鱼/徒步", text: "你在自然里找到了平静。", effects: { health: +7, happy: +6 } },
      { label: "投资/收藏", text: "你玩出了心得，还小有收益。", effects: { wealth: +8, iq: +3 } },
    ],
  },

  // ===== 中老年 (60-79) =====
  {
    id: "elder_retire", stage: { from: 55, to: 70 }, weight: 70,
    text: "你正式退休了，告别了职场。",
    choices: [
      { label: "享受天伦", text: "你把手艺和爱都给了孙辈。", effects: { eq: +8, happy: +9, health: +2 } },
      { label: "发挥余热", text: "你返聘或做顾问，闲不下来。", effects: { wealth: +6, health: -5, eq: +3 } },
      { label: "环游世界", text: "你用积蓄去看了年轻时想看的风景。", effects: { happy: +12, wealth: -12, health: -2 } },
    ],
  },
  {
    id: "elder_health", stage: { from: 60, to: 95 }, weight: 55,
    text: "你被查出一些慢性病。",
    choices: [
      { label: "积极调养", text: "你控制饮食、坚持锻炼，身体稳住。", effects: { health: +6, happy: -2 } },
      { label: "消极放任", text: "你觉得年纪大了，听天由命。", effects: { health: -12, happy: -4 } },
    ],
  },
  {
    id: "elder_friend", stage: { from: 60, to: 95 }, weight: 35,
    text: "一位老友离世，你感慨万千。",
    choices: [
      { label: "珍惜眼前", text: "你更懂得活好每一天。", effects: { eq: +6, happy: +3 } },
      { label: "陷入悲伤", text: "你久久走不出来，日渐消沉。", effects: { happy: -10, health: -5 } },
    ],
  },
  {
    id: "elder_sport", stage: { from: 60, to: 90 }, weight: 40,
    text: "你加入了社区广场舞/太极队。",
    choices: [
      { label: "天天参加", text: "你交到了朋友，身体也硬朗。", effects: { health: +7, eq: +7, happy: +6 } },
      { label: "嫌吵不去", text: "你觉得太热闹，宁愿安静。", effects: { health: -2, eq: -2, happy: -2 } },
    ],
  },
  {
    id: "elder_dream", stage: { from: 60, to: 90 }, weight: 25,
    text: "你终于有时间去做年轻时没做成的事。",
    choices: [
      { label: "去圆梦", text: "你写书/学画/办展览，人生圆满了。", effects: { happy: +15, iq: +4, eq: +4, wealth: -6 } },
      { label: "算了不折腾", text: "你已看淡，只求安稳。", effects: { happy: +2 } },
    ],
  },

  // ===== 特殊随机事件（各阶段通用） =====
  {
    id: "special_lottery", stage: { from: 18, to: 90 }, weight: 5,
    text: "你随手买的彩票，竟然中了奖！！",
    choices: [
      { label: "开心地收下", text: "一夜暴富，你笑靥如花。", effects: { wealth: +25, happy: +10 } },
      { label: "捐给慈善", text: "你把奖金捐了出去，内心平静。", effects: { wealth: +5, happy: +8, eq: +5 } },
      { label: "低调处理", text: "你怕招摇，把它悄悄存了起来。", effects: { wealth: +20, happy: +2 } },
    ],
  },
  {
    id: "special_accident", stage: { from: 15, to: 90 }, weight: 8,
    text: "你遭遇了一场意外！",
    choices: [
      { label: "大难不死", text: "你受了伤，但命保住了。", effects: { health: -20, happy: -8 } },
      { label: "轻伤侥幸", text: "你只是擦破了皮，有惊无险。", effects: { health: -5 } },
      { label: "化险为夷", text: "你身手敏捷，完美躲过。", effects: { health: +2, happy: +3 } },
    ],
  },
];

// ---- 结局评定（基于平均属性/寿命） ----
// 返回 { title, desc }
LIFE.verdict = function (state) {
  const avg = (state.stats.iq + state.stats.eq + state.stats.health + state.stats.looks + state.stats.wealth + state.stats.happy) / 6;
  const age = state.age;
  let title, desc;

  if (age >= 95) {
    title = "🏆 传奇的人生";
    desc = "你活过了漫长而丰盈的一生，见证了时代的变迁。你的智慧、健康与幸福交织成一个令人羡慕的传奇。";
  } else if (age >= 80) {
    title = "🌟 圆满的一生";
    desc = "你安享晚年，儿孙绕膝。悠悠岁月里，你积累了足够的美好回忆，此生无憾。";
  } else if (age < 30) {
    title = "💔 早逝的遗憾";
    desc = "生命戛然而止，太多风景还没来得及看。愿下辈子，你能好好走完一生。";
  } else if (avg >= 70) {
    title = "🎉 顺遂优渥";
    desc = "你的人生整体顺风顺水，事业有成、生活幸福，是许多人眼里的成功模板。";
  } else if (avg >= 55) {
    title = "🌤 平凡且真实";
    desc = "你经历过起伏，也享受过平淡。这或许是人世间大多数人最真实的写照。";
  } else if (avg >= 40) {
    title = "🌧 坎坷的旅途";
    desc = "你的人生并不容易，经历了许多风雨。但只要留住了心底的光，就仍有意义。";
  } else {
    title = "🕯 艰难的一生";
    desc = "你背负了太多苦涩。若有来生，希望世界能温柔待你。";
  }
  return { title, desc };
};

// ---- 暴露到 window（供 app.js 使用） ----
if (typeof window !== "undefined") window.LIFE = LIFE;
