const shotSizes = "(max-width: 760px) calc(100vw - 32px), (max-width: 1120px) calc(100vw - 64px), 960px";
const heroSizes = "100vw";
const thumbSizes = "(max-width: 760px) 50vw, 120px";

function media(name: string, sizes = shotSizes) {
  return {
    src: `/media/${name}.webp`,
    srcSet: [480, 960, 1280].map((width) => `/media/generated/${name}-${width}.webp ${width}w`).join(", "),
    placeholder: `/media/generated/${name}-placeholder.webp`,
    sizes,
  };
}

export const profile = {
  displayName: "HL",
  role: "茂一杀作者",
  email: "944358575@qq.com",
  github: "https://github.com/aacderf",
  bilibili: "https://space.bilibili.com/484513146",
  bilibiliName: "一个天才58",
};

export const navItems = [
  { label: "作品", to: "/maoyisha" },
  { label: "下载", to: "/download" },
  { label: "技术", to: "/build" },
  { label: "联系", to: "/about" },
];

export const release = {
  version: "1.5.10",
  tag: "v1.5.10",
  status: "GitHub Releases",
  fullPackage: {
    label: "Windows 1.5.10 完整包",
    fileName: "maoyisha-1.5.10-windows-x64.zip",
    size: "约 230 MB",
    sha256: "1ff19cf900bb10cbc7dd37cab5873722b26f909d4d18fc5172fdfd83a4cd1b66",
    href: "https://github.com/aacderf/maoyisha/releases/download/v1.5.10/maoyisha-1.5.10-windows-x64.zip",
  },
  updatePackage: {
    label: "1.3 到 1.5.10 累积更新包",
    fileName: "maoyisha-update-1.3-to-1.5.10-windows-x64.zip",
    size: "约 273 MB",
    sha256: "be8b7eecf952ebb08f117623b2ff04719d45ef786400065a2366f006d9d07fc7",
    href: "https://github.com/aacderf/maoyisha/releases/download/v1.5.10/maoyisha-update-1.3-to-1.5.10-windows-x64.zip",
  },
};

export const heroFacts = [
  { label: "作品形态", value: "大厅 / 房间 / 多人牌局" },
  { label: "桌面版本", value: `Windows ${release.version}` },
  { label: "核心链路", value: "React / Photon / Electron" },
];

export const maoyishaShots = [
  {
    ...media("maoyisha-lobby", heroSizes),
    thumbSizes,
    alt: "茂一杀大厅真实截图，右侧显示模式入口和账号区域。",
    title: "大厅入口",
    label: "大厅",
    description: "玩家进入作品后的第一屏，集中承载模式入口、房间流程和账号状态。",
  },
  {
    ...media("maoyisha-battle-8p", heroSizes),
    thumbSizes,
    alt: "茂一杀 8 人练习局真实截图，角色牌围绕牌桌排列。",
    title: "8 人牌桌",
    label: "8 人局",
    description: "多人座位、角色牌、手牌、技能区、目标选择和战况信息被压进同一张牌桌。",
  },
  {
    ...media("maoyisha-interaction"),
    thumbSizes,
    alt: "茂一杀出牌交互真实截图，展示目标选择和出牌反馈。",
    title: "出牌响应",
    label: "交互",
    description: "出牌、响应、目标选择和即时反馈是核心可玩性，截图来自真实游戏画面。",
  },
  {
    ...media("maoyisha-battle-6p"),
    thumbSizes,
    alt: "茂一杀 6 人桌面适配真实截图，顶部 HUD 与手牌区可见。",
    title: "6 人适配",
    label: "适配",
    description: "用于展示中等宽度下的座位、手牌区、角色牌和桌面空间整理。",
  },
];

export const yuexiaShots = [
  {
    ...media("yuexia-menu"),
    alt: "月下符札主菜单真实截图，显示角色、关卡、养成和开始入口。",
    title: "主菜单",
    description: "角色、关卡、养成、符卡和开始入口集中在一屏。",
  },
  {
    ...media("yuexia-battle"),
    alt: "月下符札弹幕战斗真实截图，玩家正在躲避弹幕。",
    title: "弹幕战斗",
    description: "实时弹幕射击原型，包含 Boss 弹幕、清弹和结算反馈。",
  },
  {
    ...media("yuexia-route"),
    alt: "月下符札路线选择真实截图。",
    title: "路线选择",
    description: "关卡路线、长期进度和奖励选择。",
  },
];

export const maoyishaCaseStudy = {
  subtitle: "原创校园恶搞多人联机身份卡牌游戏",
  summary:
    "茂一杀围绕大厅、开房、身份牌局、出牌响应和桌面端发布组成完整体验。作品重点不只是单张截图，而是一条从规则到联机再到 Windows 发布包的交付链路。",
  hook:
    "玩家可以进入大厅，创建房间，开始标准局或狼人杀，也可以在练习场验证出牌、响应、目标选择和桌面布局。",
  gameplay: [
    {
      title: "大厅与开房",
      detail: "大厅承载模式入口、房间流程和账号状态。玩家先进入房间，再开始多人对局。",
    },
    {
      title: "身份卡牌对局",
      detail: "角色、身份、手牌、装备、出牌阶段、响应判定和战况记录共同构成一局游戏。",
    },
    {
      title: "标准局与狼人杀",
      detail: "标准身份玩法是主线，狼人杀和练习场作为扩展入口保留在同一项目里。",
    },
    {
      title: "Windows 桌面端",
      detail: "Electron 封装为 Windows 电脑版，玩家需要解压完整文件夹后运行第一层 exe。",
    },
  ],
  buildPillars: [
    {
      title: "规则共享包",
      detail: "卡牌、角色、技能、身份和狼人杀逻辑放进 packages/shared，让 Web、桌面端和测试复用同一套规则。",
    },
    {
      title: "React 牌桌 UI",
      detail: "大厅、房间、手牌区、角色牌、目标选择、响应提示、战况层和桌面端状态由 React 组织。",
    },
    {
      title: "Photon 联机",
      detail: "Photon Realtime 承担房间、聊天、座位、对局快照、操作广播、断线重连和回到牌局。",
    },
    {
      title: "桌面发布",
      detail: "CloudBase 处理账号入口，Electron 输出 Windows 包，Capacitor 保留安卓复用空间。",
    },
  ],
  optimizations: [
    "桌面角色牌尺寸和座位布局重新收敛，避免不同分辨率下被挤压变形。",
    "拖拽出牌、整卡目标光圈、右下技能区和响应提示围绕实机操作重新打磨。",
    "战况层级、手牌裁切和 hover 位移做过多轮回归，减少牌桌信息互相遮挡。",
    "Photon 断线重连从多个入口收敛为单一状态机，减少重复重连和状态覆盖。",
    "发布包按完整 ZIP、累积更新包、SHA-256 和玩家必读说明分开整理。",
  ],
};

export const narrativeChapters = [
  {
    label: "起点",
    title: "不是重做网页，而是在已有 React / Photon 项目上继续打磨",
    summary:
      "茂一杀的关键判断是保留已有联机卡牌工程，在真实牌局里继续修 UI、修状态、修发布包。网站展示的是这个作品如何被做成可运行的桌面游戏，而不是把素材重新包装成静态页面。",
    proof: "现有规则、联机、桌面端和 QA 截图共同构成作品证据。",
  },
  {
    label: "规则",
    title: "先把规则从界面里抽出来",
    summary:
      "卡牌、角色、技能、身份和狼人杀逻辑进入共享包，React 牌桌只负责呈现与交互。这样 Web、Electron、测试脚本和后续安卓壳可以围绕同一套规则演进。",
    proof: "packages/shared 负责规则复用，避免每个端各写一份玩法。",
  },
  {
    label: "联机",
    title: "用 Photon 把房间、座位、快照和操作串起来",
    summary:
      "Photon Realtime 承担大厅开房、聊天、座位、牌局快照、操作广播和重回牌局。联机层的重点不是只连上服务器，而是让玩家掉线、重进、身份变化时仍能回到一致状态。",
    proof: "对局快照和操作广播共同支撑多人身份牌局。",
  },
  {
    label: "牌桌",
    title: "桌面 UI 围绕 4 / 6 / 8 人真实截图反复收敛",
    summary:
      "角色牌、手牌裁切、拖拽出牌、目标选择、右下技能区、战况层级和多人座位不是一次完成，而是用桌面 QA 截图持续修正比例、遮挡和阅读顺序。",
    proof: "大厅、8 人局、6 人局和交互截图均来自真实游戏画面。",
  },
  {
    label: "稳定性",
    title: "把重连和客户端生命周期收敛成可控流程",
    summary:
      "早期 onStateChange、onError、onOperationResponse 和手动重连都可能触发恢复逻辑，后续改成单一状态机。React 层也避免因为昵称或身份变化销毁 Photon client。",
    proof: "减少重复重连、重复订阅和状态覆盖，让联机层更可预测。",
  },
  {
    label: "交付",
    title: "最终交给玩家的是完整 Windows 目录",
    summary:
      "桌面端通过 Electron 和 electron-builder 输出可运行目录，再整理成完整包、累积更新包、SHA-256 和 RELEASE 说明。玩家运行的是完整目录中的第一层 exe，不是单个 exe 文件。",
    proof: "发布面板明确区分完整包、更新包、校验值和解压运行方式。",
  },
];

export const engineeringProofs = [
  {
    title: "共享规则包",
    problem: "规则写在 UI 里会让测试、桌面端和安卓端互相分裂。",
    solution: "把卡牌、角色、技能、身份、狼人杀逻辑和类型定义集中到 packages/shared。",
    result: "同一套规则服务 Web、Electron、Capacitor 和测试脚本。",
  },
  {
    title: "Photon 重连状态机",
    problem: "onStateChange、onError、onOperationResponse 和手动重连曾经会多入口触发恢复。",
    solution: "把断线、重连、重新加入房间、拉取快照收敛成单一状态机。",
    result: "减少重复重连、状态覆盖和玩家重进后画面不一致。",
  },
  {
    title: "React client 生命周期",
    problem: "昵称、身份或 UI 状态变化不应该让 Photon client 被销毁重建。",
    solution: "把联机 client 的生命周期从展示状态里拆出来，只在真正需要时创建或释放。",
    result: "降低断线、重复监听和房间状态丢失的概率。",
  },
  {
    title: "桌面手牌裁切",
    problem: "Electron 桌面窗口里手牌 hover、拖拽和底部区域容易被容器裁掉。",
    solution: "为桌面端增加专门的布局和 overflow 处理，让手牌区保留交互空间。",
    result: "拖拽出牌、手牌展开和底部 UI 在桌面端更稳定。",
  },
  {
    title: "EXE 发布目录",
    problem: "只复制 exe 会缺失 resources、assets、version.json 和签名文件。",
    solution: "发布时输出完整目录，再打成 Windows ZIP 和累积更新包。",
    result: "玩家按说明解压整个文件夹即可运行茂一杀.exe。",
  },
  {
    title: "验证闭环",
    problem: "只看浏览器预览无法证明桌面端真的可交付。",
    solution: "用 typecheck、测试、desktop:dist、桌面 QA 截图和手动解压运行组合验证。",
    result: "网站展示的截图、版本和运行方式能对应到真实构建产物。",
  },
];

export const uiPolishNotes = [
  {
    title: "桌面角色牌",
    detail: "固定角色牌比例，压住头像、血量、身份和装备信息的层级，避免 6 人和 8 人局混乱。",
  },
  {
    title: "手牌区裁切",
    detail: "手牌 hover、选中和拖拽都需要可见空间，底部容器不能把卡牌交互裁掉。",
  },
  {
    title: "拖拽出牌",
    detail: "出牌不是简单点击，拖拽动作要让玩家感到牌从手牌区进入桌面判定区。",
  },
  {
    title: "目标光圈",
    detail: "目标选择使用整卡高亮，让玩家快速判断当前技能或卡牌影响的是哪名角色。",
  },
  {
    title: "技能区",
    detail: "右下技能区保留为战斗操作中心，减少和手牌、战况记录争抢注意力。",
  },
  {
    title: "战况层级",
    detail: "战况记录只服务阅读和回溯，不抢出牌响应、目标选择和当前阶段的优先级。",
  },
  {
    title: "多人布局",
    detail: "4、6、8 人桌面布局分别校准座位、牌桌中心和 HUD，保证不同人数都能看清。",
  },
];

export const stackRoles = [
  {
    name: "React",
    role: "承载大厅、房间、牌桌、手牌、角色牌、截图舞台和作品官网界面。",
    proof: "真实游戏截图均来自 React UI。",
  },
  {
    name: "Vite",
    role: "负责 Web 开发服务、静态站构建和站点发布产物。",
    proof: "apps/site 构建后输出 dist。",
  },
  {
    name: "TypeScript",
    role: "约束规则数据、联机状态、组件入参、发布脚本和构建流程。",
    proof: "构建前执行类型检查。",
  },
  {
    name: "Photon Realtime",
    role: "负责房间、聊天、多人同步、操作广播、断线重连和回到牌局。",
    proof: "牌局快照和重连状态机围绕 Photon 实现。",
  },
  {
    name: "CloudBase",
    role: "提供账号、验证码、昵称和云端能力入口。",
    proof: "账号层和本地访客流程保持独立。",
  },
  {
    name: "Electron",
    role: "把 Web 游戏封装成 Windows 电脑版。",
    proof: "玩家运行解压目录第一层的 茂一杀.exe。",
  },
  {
    name: "Capacitor",
    role: "复用 Web 游戏到 Android 横屏端。",
    proof: "移动端壳与 Web 规则和联机协议复用。",
  },
  {
    name: "electron-builder",
    role: "输出 win-unpacked、安装包和可整理的 Windows 发布目录。",
    proof: "发布目录再打包为完整 ZIP 和累积更新包。",
  },
];

export const buildTimeline = [
  {
    phase: "01",
    title: "规则先独立",
    detail: "卡牌、角色、技能、身份、狼人杀逻辑和类型定义先放进共享包，避免 UI 和规则互相绑死。",
  },
  {
    phase: "02",
    title: "牌桌再成型",
    detail: "大厅、房间、角色牌、手牌区、目标选择、响应提示和战况层把规则变成可操作界面。",
  },
  {
    phase: "03",
    title: "接入联机层",
    detail: "房间列表、进房、聊天、座位、对局快照、操作广播和断线恢复交给 Photon 处理。",
  },
  {
    phase: "04",
    title: "账号与访客",
    detail: "CloudBase 处理登录、验证码、昵称和云能力入口，同时保留本地访客体验。",
  },
  {
    phase: "05",
    title: "桌面体验打磨",
    detail: "围绕 4 人、6 人、8 人截图修角色牌、手牌裁切、目标光圈、技能区和战况阅读顺序。",
  },
  {
    phase: "06",
    title: "重连状态收敛",
    detail: "把 onStateChange、onError、onOperationResponse 和手动重连合并为单一流程，减少重复重连。",
  },
  {
    phase: "07",
    title: "Windows 封装",
    detail: "用 Electron 和 electron-builder 输出桌面目录，再生成完整包、更新包、RELEASE 说明和 SHA-256。",
  },
];

export const qualityChecks = [
  {
    command: "npm run typecheck",
    detail: "检查共享规则包和 Web 端类型约束。",
    result: "先发现规则数据、状态字段和组件入参问题。",
  },
  {
    command: "npm test",
    detail: "运行共享规则和 Web 测试。",
    result: "验证规则、联机辅助逻辑和关键行为没有回退。",
  },
  {
    command: "npm run desktop:dist",
    detail: "生成 Windows 桌面端目录。",
    result: "确认 Electron 包能产出可运行的桌面文件结构。",
  },
  {
    command: "npm run qa:desktop",
    detail: "生成桌面 QA 截图并检查关键分辨率。",
    result: "用 4、6、8 人实机画面验证布局。",
  },
  {
    command: "解压完整 ZIP 并运行 茂一杀.exe",
    detail: "按玩家路径验收发布包。",
    result: "确认不是只在开发环境能跑。",
  },
];

export const releaseChecklist = [
  "完整包适合首次安装，包含 exe、resources、assets 和版本文件。",
  "累积更新包适合已有 1.3 及以上旧版本的玩家。",
  "SHA-256 用于核对下载文件是否完整。",
  "运行前需要先解压整个文件夹，不要单独复制 exe。",
];

export const downloadNotes = [
  "解压后运行第一层的 茂一杀.exe。",
  "不要只下载或复制单个 exe，resources、assets、version.json、version.sig 必须和 exe 放在一起。",
  "使用离线更新包前先关闭游戏，再运行更新器或覆盖对应目录。",
  "如果旧版本目录混乱，优先重新下载完整 Windows ZIP。",
];

export const faqItems = [
  {
    question: "现在能直接下载吗？",
    answer: "可以。下载按钮指向 GitHub Releases，建议新玩家优先下载完整 Windows 包。",
  },
  {
    question: "完整包和累积更新包怎么选？",
    answer: "新玩家下载完整包。已有 1.3 及以上旧版本的玩家，可以使用 1.3 到 1.5.10 的累积更新包。",
  },
  {
    question: "为什么不能只复制 exe？",
    answer: "Windows 电脑版依赖同目录下的资源文件和版本文件。单独复制 exe 会导致资源缺失或更新校验失败。",
  },
  {
    question: "网站里有三国杀截图吗？",
    answer: "没有。公开页面只使用茂一杀和月下符札真实截图，三国杀参考图不进入网站成品。",
  },
];
