"use client";

import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Checkbox, ConfigProvider, Drawer, Input, Modal, Pagination, Progress, Select, Tag } from "antd";
import { useMemo, useState } from "react";
import type React from "react";
import styles from "./page.module.css";

type PlanState = "NONE" | "DRAFT" | "ACTIVE" | "CLOSED";
type PlanItemStatus = "计划中" | "已完成" | "已取消";
type Source = "周初计划" | "周中追加" | "跨周结转";

type PlanItem = {
  id: number;
  decree: string;
  image: string;
  store: string;
  product: string;
  requirement: string;
  designer: string;
  source: Source;
  status: PlanItemStatus;
  plannedAt: string;
  completedAt?: string;
};

const planStates: { key: PlanState; label: string }[] = [
  { key: "NONE", label: "尚未建立计划" },
  { key: "DRAFT", label: "DRAFT 草稿" },
  { key: "ACTIVE", label: "ACTIVE 已激活" },
  { key: "CLOSED", label: "CLOSED 已关闭" },
];

const seedPlanItems: PlanItem[] = [
  { id: 1, decree: "天字第000125号", image: "#1 主图白底", store: "北欧风沙发", product: "CP-4589", requirement: "主图", designer: "张晓宇", source: "周初计划", status: "已完成", plannedAt: "07-14 09:20", completedAt: "07-15 16:18" },
  { id: 2, decree: "天字第000125号", image: "#2 场景使用图", store: "北欧风沙发", product: "CP-4589", requirement: "场景修改", designer: "张晓宇", source: "周初计划", status: "计划中", plannedAt: "07-14 09:20" },
  { id: 3, decree: "天字第000121号", image: "#1 产品细节图", store: "清透美妆", product: "CP-3321", requirement: "附图套版", designer: "李思远", source: "周初计划", status: "计划中", plannedAt: "07-14 10:00" },
  { id: 4, decree: "天字第000118号", image: "#3 A+ 模块图", store: "亚马逊美国站", product: "CP-7712", requirement: "A+", designer: "王一诺", source: "周中追加", status: "计划中", plannedAt: "07-16 14:32" },
  { id: 5, decree: "天字第000114号", image: "#2 详情页长图", store: "新中式家具", product: "CP-2201", requirement: "详情页", designer: "赵子涵", source: "跨周结转", status: "已取消", plannedAt: "07-14 11:15" },
  { id: 6, decree: "天字第000113号", image: "#1 产品海报", store: "亚马逊英国站", product: "CP-5513", requirement: "主图", designer: "李思远", source: "周中追加", status: "已完成", plannedAt: "07-17 09:08", completedAt: "07-18 13:46" },
];

const candidateTasks = [
  { id: 101, decree: "天字第000130号", image: "#1 主图白底", store: "亚马逊美国站", product: "CP-8001", requirement: "主图", designer: "张晓宇", status: "待开始", eligible: true, reason: "" },
  { id: 102, decree: "天字第000130号", image: "#2 场景图", store: "亚马逊美国站", product: "CP-8001", requirement: "场景修改", designer: "李思远", status: "待开始", eligible: true, reason: "" },
  { id: 103, decree: "天字第000131号", image: "#1 尺寸示意", store: "清透美妆", product: "CP-8008", requirement: "附图套版", designer: "-", status: "待分配", eligible: false, reason: "尚未分配设计师" },
  { id: 104, decree: "天字第000112号", image: "#3 详情页长图", store: "北欧风沙发", product: "CP-4510", requirement: "详情页", designer: "王一诺", status: "已完成", eligible: false, reason: "已经完成" },
  { id: 105, decree: "天字第000125号", image: "#1 主图白底", store: "北欧风沙发", product: "CP-4589", requirement: "主图", designer: "张晓宇", status: "计划中", eligible: false, reason: "已存在于本周计划" },
];

const carryOverTasks = [
  { id: 201, decree: "天字第000109号", image: "#2 场景使用图", designer: "赵子涵", source: "周初计划", status: "制作中", eligible: true, reason: "" },
  { id: 202, decree: "天字第000107号", image: "#1 产品细节图", designer: "王一诺", source: "周中追加", status: "待审核", eligible: true, reason: "" },
  { id: 203, decree: "天字第000104号", image: "#3 主图白底", designer: "-", source: "周初计划", status: "待分配", eligible: false, reason: "尚未分配设计师" },
  { id: 204, decree: "天字第000103号", image: "#1 A+ 模块图", designer: "李思远", source: "跨周结转", status: "已完成", eligible: false, reason: "已经完成" },
];

const designerProgress = [
  { name: "张晓宇", done: 8, planned: 12, remaining: 4, assigned: 12 },
  { name: "李思远", done: 6, planned: 10, remaining: 4, assigned: 10 },
  { name: "王一诺", done: 5, planned: 8, remaining: 3, assigned: 8 },
  { name: "赵子涵", done: 7, planned: 10, remaining: 3, assigned: 10 },
];

const weekBars = [
  { day: "一", last: 36, current: 44 }, { day: "二", last: 28, current: 39 }, { day: "三", last: 42, current: 46 },
  { day: "四", last: 38, current: 51 }, { day: "五", last: 46, current: 56 }, { day: "六", last: 27, current: 37 }, { day: "日", last: 34, current: 42 },
];

const taskRows = [
  ["天字第000130号", "亚马逊美国站", "CP-8001", "主图", "6", "07-14 10:20"],
  ["天字第000128号", "清透美妆", "CP-3321", "A+", "5", "07-14 09:42"],
  ["天字第000126号", "北欧风沙发", "CP-7712", "主图", "4", "07-13 16:08"],
  ["天字第000124号", "日系生活", "CP-6560", "场景修改", "3", "07-13 14:36"],
  ["天字第000119号", "北美家居", "CP-4088", "附图套版", "4", "07-12 17:18"],
];

const reviewRows = [
  ["天字第000125号", "#2 场景使用图", "张晓宇", "07-14 15:20"],
  ["天字第000121号", "#1 产品细节图", "李思远", "07-14 14:48"],
  ["天字第000118号", "#3 A+ 模块图", "王一诺", "07-14 11:06"],
  ["天字第000116号", "#1 主图白底图", "赵子涵", "07-13 18:12"],
  ["天字第000111号", "#4 尺寸示意图", "陈沐阳", "07-13 16:40"],
];

export default function DesignManagerDashboardPrototype() {
  const [planState, setPlanState] = useState<PlanState>("ACTIVE");
  const [view, setView] = useState<"dashboard" | "plan">("dashboard");
  const [controlOpen, setControlOpen] = useState(false);
  const [drawer, setDrawer] = useState<"add" | "carry" | null>(null);
  const [modal, setModal] = useState<"activate" | "close" | "cancel" | "restore" | "batchAdd" | "batchCarry" | null>(null);
  const [planItems, setPlanItems] = useState(seedPlanItems);
  const [selectedAdd, setSelectedAdd] = useState<number[]>([]);
  const [selectedCarry, setSelectedCarry] = useState<number[]>([]);
  const [cancelReason, setCancelReason] = useState("");
  const [filter, setFilter] = useState({ keyword: "", designer: "", source: "", status: "", requirement: "" });

  const visibleItems = useMemo(() => planItems.filter((item) => {
    const q = filter.keyword.trim().toLowerCase();
    return (!q || [item.decree, item.image, item.store, item.product].join(" ").toLowerCase().includes(q))
      && (!filter.designer || item.designer === filter.designer)
      && (!filter.source || item.source === filter.source)
      && (!filter.status || item.status === filter.status)
      && (!filter.requirement || item.requirement === filter.requirement);
  }), [filter, planItems]);

  const switchState = (state: PlanState) => {
    setPlanState(state);
    setView("dashboard");
    setDrawer(null);
    setModal(null);
  };

  const activatePlan = () => { setPlanState("ACTIVE"); setModal(null); };
  const closePlan = () => { setPlanState("CLOSED"); setModal(null); };
  const cancelOne = () => {
    setPlanItems((items) => items.map((item) => item.id === 4 ? { ...item, status: "已取消" } : item));
    setCancelReason("");
    setModal(null);
  };
  const restoreOne = () => {
    setPlanItems((items) => items.map((item) => item.id === 5 ? { ...item, status: "计划中" } : item));
    setModal(null);
  };
  const simulateAdd = () => { setSelectedAdd([]); setModal(null); setDrawer(null); };
  const simulateCarry = () => { setSelectedCarry([]); setModal(null); setDrawer(null); };

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#111111", borderRadius: 8, colorText: "#171717", fontFamily: "Arial, 'Microsoft YaHei', sans-serif" } }}>
      <main className={styles.prototype}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}><div className={styles.brandMark}>天</div><b>天机阁</b><span>TianJi Pavilion</span></div>
          <div className={styles.roleLabel}>设计主管工作区</div>
          <nav className={styles.nav}>
            {[[DashboardOutlined, "驾驶舱"], [FileTextOutlined, "法旨中心"], [TeamOutlined, "待分配"], [CheckOutlined, "待审核"], [FolderOpenOutlined, "设计任务"]].map(([icon, text], index) => {
              const Icon = icon as React.ComponentType;
              return <button key={String(text)} className={`${styles.navItem} ${index === 0 ? styles.navActive : ""}`}><Icon /><span>{String(text)}</span></button>;
            })}
          </nav>
          <div className={styles.sidebarBottom}><div className={styles.sideLine} /><button className={styles.userPill}><UserOutlined /> 蔡徐坤 <MoreOutlined /></button><span>设计主管</span></div>
        </aside>

        <section className={styles.workspace}>
          <header className={styles.topbar}>
            {view === "dashboard" ? <div className={styles.headerTitle}><strong>设计主管驾驶舱</strong><span>2026.07.13—2026.07.19 · 当前角色：设计主管</span></div> : <div className={styles.crumb}>设计主管 / 本周计划管理</div>}
            <div className={styles.headerActions}>
              <div className={styles.search}><SearchOutlined /><span>搜索法旨、产品、设计师、店铺</span></div>
              <div className={styles.prototypeControl}>
                <button className={styles.prototypeTrigger} onClick={() => setControlOpen((open) => !open)}>UI 预稿控制 <MoreOutlined /></button>
                {controlOpen && <div className={styles.controlPopover}>
                  <div className={styles.controlCaption}>Mock / 仅预稿</div>
                  <span>预稿状态</span>
                  <div className={styles.stateSwitch}>{planStates.map((state) => <button key={state.key} onClick={() => switchState(state.key)} className={planState === state.key ? styles.stateActive : ""}>{state.label}</button>)}</div>
                  <div className={styles.prototypeActions}>
                    <button onClick={() => { setView("plan"); setControlOpen(false); }}>打开本周计划管理</button>
                    <button onClick={() => setDrawer("add")}>添加任务抽屉</button>
                    <button onClick={() => setDrawer("carry")}>跨周结转抽屉</button>
                    <button onClick={() => setModal("cancel")}>取消计划项</button>
                    <button onClick={() => setModal("close")}>关闭计划确认</button>
                  </div>
                </div>}
              </div>
              <button className={styles.userMenu}>设计主管 <MoreOutlined /></button>
              <div className={styles.topDate}><CalendarOutlined /> 2026.07.14 <small>周二</small></div>
            </div>
          </header>

          <div className={styles.content}>
            {view === "dashboard" ? (
              <DashboardView planState={planState} onManage={() => setView("plan")} onCreate={() => setPlanState("DRAFT")} onActivate={() => setModal("activate")} />
            ) : (
              <PlanManagementView
                planState={planState}
                items={visibleItems}
                filter={filter}
                setFilter={setFilter}
                onBack={() => setView("dashboard")}
                onAdd={() => setDrawer("add")}
                onCarry={() => setDrawer("carry")}
                onActivate={() => setModal("activate")}
                onClose={() => setModal("close")}
                onCancel={() => setModal("cancel")}
                onRestore={() => setModal("restore")}
              />
            )}
          </div>
        </section>

        <TaskDrawer title="分配图片任务" open={drawer === "add"} tasks={candidateTasks} selected={selectedAdd} setSelected={setSelectedAdd} onClose={() => setDrawer(null)} onSubmit={() => setModal("batchAdd")} action="批量分配" />
        <TaskDrawer title="跨周结转" open={drawer === "carry"} tasks={carryOverTasks} selected={selectedCarry} setSelected={setSelectedCarry} onClose={() => setDrawer(null)} onSubmit={() => setModal("batchCarry")} action="批量结转" carry />

        <Modal open={modal === "activate"} onCancel={() => setModal(null)} footer={null} centered><ConfirmBody icon={<CheckOutlined />} title="激活本周计划" detail="激活后，新加入任务将标记为周中追加。现有周初计划保持不变。" confirm="确认激活" onConfirm={activatePlan} onCancel={() => setModal(null)} /></Modal>
        <Modal open={modal === "close"} onCancel={() => setModal(null)} footer={null} centered><ConfirmBody icon={<CloseOutlined />} title="关闭本周计划" detail="关闭后计划只读，未完成任务不会倒改本周完成率，可在下周确认结转。" confirm="确认关闭" onConfirm={closePlan} onCancel={() => setModal(null)} /></Modal>
        <Modal open={modal === "cancel"} onCancel={() => setModal(null)} footer={null} centered><div className={styles.confirmIcon}><CloseCircleOutlined /></div><h3>取消本周计划项</h3><p>仅取消本周计划安排，不会删除图片任务。</p><Input.TextArea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="请填写取消原因" rows={3} /><div className={styles.modalFooter}><button onClick={() => setModal(null)}>返回</button><button className={styles.blackButton} disabled={!cancelReason.trim()} onClick={cancelOne}>确认取消</button></div></Modal>
        <Modal open={modal === "restore"} onCancel={() => setModal(null)} footer={null} centered><ConfirmBody icon={<ArrowLeftOutlined />} title="恢复计划项" detail="将恢复同一条计划记录为计划中，不会新增重复任务。" confirm="确认恢复" onConfirm={restoreOne} onCancel={() => setModal(null)} /></Modal>
        <Modal open={modal === "batchAdd"} onCancel={() => setModal(null)} footer={null} centered><ConfirmBody icon={<PlusOutlined />} title={`批量分配 ${selectedAdd.length} 项图片任务`} detail="这是本地预稿交互，不会调用接口或修改本周完成目标。" confirm="模拟分配" onConfirm={simulateAdd} onCancel={() => setModal(null)} /></Modal>
        <Modal open={modal === "batchCarry"} onCancel={() => setModal(null)} footer={null} centered><ConfirmBody icon={<ArrowRightOutlined />} title={`批量结转 ${selectedCarry.length} 项任务`} detail="这是本地预稿交互，不会修改上周计划或真实任务。" confirm="模拟结转" onConfirm={simulateCarry} onCancel={() => setModal(null)} /></Modal>
      </main>
    </ConfigProvider>
  );
}

function DashboardView({ planState, onManage, onCreate, onActivate }: { planState: PlanState; onManage: () => void; onCreate: () => void; onActivate: () => void }) {
  const isNone = planState === "NONE";
  const isDraft = planState === "DRAFT";
  const isActive = planState === "ACTIVE";
  return <>
    <section className={styles.topGrid}>
      <article className={styles.darkCard}>
        <div className={styles.darkCardBody}>
          <div className={styles.darkPrimary}>
            <div className={styles.cardTitle}>未完成图片任务 <span className={styles.infoDot}>i</span></div>
            <div className={styles.darkNumber}>42 <small>张</small></div>
            <div className={styles.darkFooter}><span>今日新增 <b>6 张</b></span><span>本周新增 <b>24 张</b></span></div>
          </div>
          <div className={styles.taskMetrics}>
            <Metric label="待分配" value="12" />
            <Metric label="待开始与制作中" value="18" />
            <Metric label="待审核" value="7" />
            <Metric label="退回修改" value="5" />
          </div>
        </div>
      </article>
      <article className={styles.planCard}>{isNone && <><div className={styles.cardTitle}>本周目标概览</div><div className={styles.noPlan}><div><FolderOpenOutlined /><h2>尚未设置本周完成目标</h2></div><p>当前可分配图片任务：<b>15 张</b></p><button className={styles.blackButton} onClick={onCreate}>设置本周目标</button></div></>}{isDraft && <><div className={styles.cardTitle}>本周目标概览 <Tag>草稿</Tag></div><div className={styles.draftPlan}><div><strong>12</strong><small>本周预计完成图片</small></div><div><b>3 名</b><span>涉及设计师</span></div><div><b>12 张</b><span>周初目标</span></div></div><div className={styles.planButtons}><button onClick={onManage}>管理目标</button><button className={styles.blackButton} onClick={onActivate}>确认目标</button></div></>}{isActive && <><div className={styles.cardTitle}>本周目标概览 <Tag>已启用</Tag></div><div className={styles.activePlan}><div className={styles.activeScore}><strong>67%</strong><span>本周目标完成率</span></div><div className={styles.activeMiddle}><b>已完成 8 / 当前目标 12</b><Progress percent={67} showInfo={false} strokeColor="#111" trailColor="#dedede" /><small>剩余 <strong>4 张</strong></small></div><div className={styles.activeSide}><div className={styles.activeSideStats}><span>目标数量 <b>10 张</b></span><span>实际分配 <b>12 张</b></span><span>已完成 <b>8 张</b></span><span>待审核 <b>1 张</b></span></div><button className={styles.blackButton} onClick={onManage}>管理本周计划</button></div></div></>}{planState === "CLOSED" && <><div className={styles.cardTitle}>本周目标概览</div><div className={styles.closedLayout}><div className={styles.closedState}><Tag>已关闭</Tag><h2>本周目标已关闭</h2></div><div className={styles.closedSummary}><span>设计完成</span><b>10 / 12</b><small>仅供历史查看</small></div><div className={styles.closedRate}><strong>83%</strong><span>最终完成率</span><button className={styles.blackButton} onClick={onManage}>查看计划详情</button></div></div></>}</article>
    </section>
    <section className={styles.trendGrid}><WeeklyChart /></section>
    <section className={styles.designerGrid}><DesignerProgress planState={planState} /></section>
    <section className={styles.bottomGrid}><TaskList title="待分配任务" columns={["法旨编号", "店铺", "产品编号", "需求类型", "图片数量", "审批时间"]} rows={taskRows} action="去分配" /><TaskList title="待审核完成稿" columns={["法旨编号", "图片任务", "设计师", "提交时间"]} rows={reviewRows} action="去审核" review /></section>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div>; }

function WeeklyChart() { const maximum = Math.max(...weekBars.flatMap((bar) => [bar.last, bar.current])); const step = Math.max(10, Math.ceil(maximum / 30) * 10); const axisMaximum = step * 3; const axis = [axisMaximum, axisMaximum - step, step, 0]; const barHeight = (value: number) => `${Math.max(1, value / axisMaximum * 100)}%`; return <article className={styles.whiteCard}><div className={styles.cardHeading}><div><h2>上周与本周实际审核通过</h2><span>按天 / 单位：张</span></div><div className={styles.legend}><i />上周 <i className={styles.currentLegend} />本周</div></div><div className={styles.chart}><div className={styles.axis}><div className={styles.axisTicks}>{axis.map((value) => <span key={value}>{value}</span>)}</div><div /></div><div className={styles.barArea}><div className={styles.plotArea}>{weekBars.map((bar) => <div className={styles.barGroup} key={bar.day}><div className={styles.bars}><span title={`上周 ${bar.last} 张`} style={{ height: barHeight(bar.last) }} /><b title={`本周 ${bar.current} 张`} style={{ height: barHeight(bar.current) }} /></div></div>)}</div><div className={styles.xAxisLabels}>{weekBars.map((bar) => <label key={bar.day}>周{bar.day}</label>)}</div></div></div></article>; }

function DesignerProgress({ planState }: { planState: PlanState }) { const isNone = planState === "NONE"; const isDraft = planState === "DRAFT"; const isClosed = planState === "CLOSED"; return <article className={styles.whiteCard}><div className={styles.cardHeading}><div><h2>设计师本周任务进度</h2><span>{isNone ? "尚未建立本周计划" : isDraft ? "草稿阶段，仅展示已分配数量" : isClosed ? "本周计划已关闭，展示最终结果" : "当前周正式计划"}</span></div></div>{isNone ? <div className={styles.progressEmpty}><FolderOpenOutlined /><b>尚未建立本周计划</b><span>建立计划后可查看设计师任务安排</span></div> : <div className={`${styles.designerColumns} ${isDraft ? styles.draftDesignerColumns : ""}`}>{designerProgress.map((designer) => { const percent = Math.round(designer.done / designer.planned * 100); return <div className={styles.designerColumn} key={designer.name}><div className={styles.designerNameLine}><b>{designer.name}</b><strong>{isDraft ? `${designer.assigned} 张` : `${percent}%`}</strong></div><div className={styles.designerMeta}>{isDraft ? `已分配 ${designer.assigned} 张` : `${isClosed ? "最终完成" : "已完成"} ${designer.done} / 本周计划 ${designer.planned}`}</div>{!isDraft && <><div className={styles.designerRemaining}>剩余 {designer.remaining} 张</div><Progress percent={percent} showInfo={false} strokeColor="#111" trailColor="#e5e5e5" /></>}</div>; })}</div>}</article>; }

function TaskList({ title, columns, rows, action, review = false }: { title: string; columns: string[]; rows: string[][]; action: string; review?: boolean }) { return <article className={`${styles.listCard} ${review ? styles.reviewList : ""}`}><div className={styles.cardHeading}><h2>{title}</h2><button>查看全部 <ArrowRightOutlined /></button></div><div className={styles.taskTable}><div className={styles.taskHead}>{review && <span>缩略图</span>}{columns.map((column) => <span key={column}>{column}</span>)}{review && <span>预览</span>}<span>操作</span></div>{rows.map((row, index) => <div className={styles.taskRow} key={`${row[0] ?? ""}-${row[1] ?? ""}`}>{review && <button className={`${styles.previewThumb} ${styles[`previewThumb${index % 5}`]}`} aria-label={`预览 ${row[0]}`} title={`预览 ${row[0]}`} />}{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}{review && <button className={styles.previewAction}>预览</button>}<button>{action}</button></div>)}</div></article>; }

function PlanManagementView({ planState, items, filter, setFilter, onBack, onAdd, onCarry, onActivate, onClose, onCancel, onRestore }: { planState: PlanState; items: PlanItem[]; filter: any; setFilter: any; onBack: () => void; onAdd: () => void; onCarry: () => void; onActivate: () => void; onClose: () => void; onCancel: () => void; onRestore: () => void }) {
  const planExists = planState !== "NONE";
  return <><section className={styles.planPageHeader}><div><button className={styles.backButton} onClick={onBack}><ArrowLeftOutlined /> 返回驾驶舱</button><div className={styles.eyebrow}>2026.07.14 - 2026.07.20</div><h1>本周计划管理</h1><p>{planState === "NONE" ? "尚未建立本周计划" : `当前状态：${planState === "DRAFT" ? "草稿" : planState === "ACTIVE" ? "已激活" : "已关闭"}`}</p></div><div className={styles.planPageActions}>{planState === "DRAFT" && <><button onClick={onAdd}><PlusOutlined /> 分配图片任务</button><button className={styles.blackButton} onClick={onActivate}>激活计划</button></>}{planState === "ACTIVE" && <><button onClick={onAdd}><PlusOutlined /> 分配图片任务</button><button onClick={onCarry}>查看结转候选</button><button className={styles.blackButton} onClick={onClose}>关闭本周计划</button></>}{planState === "NONE" && <button className={styles.blackButton} onClick={onActivate}>建立并激活计划</button>}</div></section>
    <section className={styles.planOverview}>{[["周初计划", "10"], ["周中追加", "2"], ["跨周结转", "0"], ["当前有效计划", "12"], ["已完成", "8"], ["剩余", "4"], ["已取消", "1"]].map(([label, value]) => <div key={label}><span>{label}</span><b>{planExists ? value : "-"}</b></div>)}</section>
    <section className={styles.planTableCard}><div className={styles.tableToolbar}><Input prefix={<SearchOutlined />} value={filter.keyword} onChange={(e) => setFilter({ ...filter, keyword: e.target.value })} placeholder="搜索法旨编号、图片任务、产品编号" /><Select allowClear placeholder="设计师" value={filter.designer || undefined} onChange={(value) => setFilter({ ...filter, designer: value || "" })} options={designerProgress.map((designer) => ({ value: designer.name, label: designer.name }))} /><Select allowClear placeholder="来源" value={filter.source || undefined} onChange={(value) => setFilter({ ...filter, source: value || "" })} options={["周初计划", "周中追加", "跨周结转"].map((value) => ({ value, label: value }))} /><Select allowClear placeholder="状态" value={filter.status || undefined} onChange={(value) => setFilter({ ...filter, status: value || "" })} options={["计划中", "已完成", "已取消"].map((value) => ({ value, label: value }))} /><Select allowClear placeholder="需求类型" value={filter.requirement || undefined} onChange={(value) => setFilter({ ...filter, requirement: value || "" })} options={["主图", "场景修改", "附图套版", "A+", "详情页"].map((value) => ({ value, label: value }))} /></div>
      <div className={styles.planTable}><div className={styles.planHead}><span>法旨编号 / 图片任务</span><span>店铺 / 产品编号</span><span>需求类型</span><span>当前设计师</span><span>来源</span><span>状态</span><span>加入时间</span><span>完成时间</span><span>操作</span></div>{planExists ? items.map((item) => <div className={styles.planRow} key={item.id}><span><b>{item.decree}</b><small>{item.image}</small></span><span><b>{item.store}</b><small>{item.product}</small></span><span>{item.requirement}</span><span>{item.designer}</span><span><Tag>{item.source}</Tag></span><span><Tag className={item.status === "已完成" ? styles.doneTag : item.status === "已取消" ? styles.cancelledTag : ""}>{item.status}</Tag></span><span>{item.plannedAt}</span><span>{item.completedAt || "-"}</span><span>{planState === "CLOSED" ? <button disabled>只读</button> : item.status === "已取消" ? <button onClick={onRestore}>恢复</button> : item.status === "已完成" ? <button disabled>已完成</button> : <button onClick={onCancel}>取消计划</button>}</span></div>) : <div className={styles.tableEmpty}><FolderOpenOutlined /><b>建立计划后可添加本周图片任务</b></div>}</div>
      <div className={styles.pagination}><span>{planExists ? `共 ${items.length} 项` : "暂无计划项"}</span><Pagination current={1} total={Math.max(1, items.length)} pageSize={10} size="small" showSizeChanger={false} /></div>
    </section>
  </>;
}

function TaskDrawer({ title, open, tasks, selected, setSelected, onClose, onSubmit, action, carry = false }: { title: string; open: boolean; tasks: any[]; selected: number[]; setSelected: (ids: number[]) => void; onClose: () => void; onSubmit: () => void; action: string; carry?: boolean }) {
  const selectedEligible = tasks.filter((task) => task.eligible && selected.includes(task.id));
  const toggleAll = (checked: boolean) => setSelected(checked ? tasks.filter((task) => task.eligible).map((task) => task.id) : []);
  return <Drawer title={<div className={styles.drawerTitle}><span>{title}</span><small>UI 预稿 / 本地模拟</small></div>} width={760} open={open} onClose={onClose} footer={<div className={styles.drawerFooter}><span>已选择 {selectedEligible.length} 项可处理任务</span><div><button onClick={onClose}>取消</button><button className={styles.blackButton} disabled={!selectedEligible.length} onClick={onSubmit}>{action}</button></div></div>}>
    <div className={styles.drawerIntro}>{carry ? "以下为上周未完成任务的只读预览。结转不会修改上周计划。" : "仅显示可分配或需人工确认的图片任务。本操作只在原型页面模拟。"}</div>
    <div className={styles.drawerFilters}><Input prefix={<SearchOutlined />} placeholder="搜索法旨编号、图片任务、产品编号" /><Select placeholder="设计师" options={designerProgress.map((designer) => ({ value: designer.name, label: designer.name }))} /><Select placeholder="需求类型" options={["主图", "场景修改", "附图套版", "A+"].map((value) => ({ value, label: value }))} /></div>
    <div className={styles.drawerTable}><div className={styles.drawerHead}><Checkbox checked={selected.length === tasks.filter((task) => task.eligible).length && selected.length > 0} onChange={(event) => toggleAll(event.target.checked)} /><span>法旨编号 / 图片任务</span><span>{carry ? "上周来源" : "店铺 / 产品编号"}</span><span>当前设计师</span><span>当前状态</span><span>是否可分配</span></div>{tasks.map((task) => <div className={styles.drawerRow} key={task.id}><Checkbox disabled={!task.eligible} checked={selected.includes(task.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, task.id] : selected.filter((id) => id !== task.id))} /><span><b>{task.decree}</b><small>{task.image}</small></span><span>{carry ? task.source : <><b>{task.store}</b><small>{task.product} · {task.requirement}</small></>}</span><span>{task.designer}</span><span>{task.status}</span><span>{task.eligible ? <Tag className={styles.eligibleTag}>可分配</Tag> : <><Tag className={styles.blockedTag}>不可分配</Tag><small>{task.reason}</small></>}</span></div>)}</div>
  </Drawer>;
}

function ConfirmBody({ icon, title, detail, confirm, onConfirm, onCancel }: { icon: React.ReactNode; title: string; detail: string; confirm: string; onConfirm: () => void; onCancel: () => void }) { return <div className={styles.confirmBody}><div className={styles.confirmIcon}>{icon}</div><h3>{title}</h3><p>{detail}</p><div className={styles.modalFooter}><button onClick={onCancel}>返回</button><button className={styles.blackButton} onClick={onConfirm}>{confirm}</button></div></div>; }
