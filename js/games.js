/**
 * The catalogue. Adding a game is one entry here plus its folder on disk.
 * Kept free of DOM access so build tools can import it too.
 */

export const GAMES = [
  {
    id: 'neon-dash',
    title: 'NEON DASH',
    subtitle: '霓虹疾走',
    href: '/neon-dash/',
    desc: '三车道 3D 霓虹无尽跑酷。跳过矮栏、滑过横杆、绕开立柱，收集金币叠连击，还有磁铁护盾加速三种道具。',
    tags: ['3D', '跑酷', '无尽', 'WebGL'],
    accent: '#27f4ff',
    accent2: '#ff2fd0',
    art: 'neon',
    badge: 'NEW',
  },
  {
    id: 'life-simulator',
    title: '人生模拟器',
    subtitle: 'Life Simulator',
    href: '/life-simulator/',
    desc: '从出生到终老，体验一场又随机又精彩的人生。分配天赋点，在数十个随机事件里做出自己的选择。',
    tags: ['文字', '模拟', '随机', '轻量'],
    accent: '#ffd447',
    accent2: '#8b5cff',
    art: 'life',
    badge: '',
  },
];
