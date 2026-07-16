const EXTRA_BLUEPRINTS = {
  'P01:p01-site-survey-map': ['siteSurveyMapIntro', '室内底图', ['机房', '走线', '机柜', '表单'], ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed']],
  'P02:p02-outdoor-site-survey': ['outdoorSurveySectorIntro', '室外扇区', ['道路', '楼宇', '站向', '遮挡'], ['#0f766e', '#2563eb', '#ca8a04', '#dc2626']],
  'P03:p03-complaint-evidence-loop': ['complaintEvidenceChainIntro', '投诉证据链', ['主诉', '位置', '日志', '复测'], ['#2563eb', '#f59e0b', '#dc2626', '#0f766e']],
  'P04:p04-dt-cqt-concept': ['dtCqtContrastIntro', '路线与点位', ['DT', 'CQT', 'GPS', 'LOG'], ['#2563eb', '#e11d48', '#0f766e', '#f59e0b']],
  'P05:p05-test-trouble-process': ['troubleTriageIntro', '异常分流', ['掉线', '覆盖', '参数', '复核'], ['#dc2626', '#f59e0b', '#7c3aed', '#0f766e']],
  'P06:p06-test-data-kpi-diagnosis': ['kpiThresholdIntro', '阈值诊断', ['RSRP', 'SINR', '事件', '小区'], ['#2563eb', '#0f766e', '#dc2626', '#f59e0b']],
  'P07:p07-nms-function-map': ['nmsHubIntro', '网管能力', ['告警', '性能', '参数', '工单'], ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed']],
  'P08:p08-realtime-kpi-curve': ['monitoringTopnIntro', '运行监控', ['告警', 'KPI', 'TOPN', '闭环'], ['#e11d48', '#2563eb', '#f59e0b', '#0f766e']],
  'P09:p09-parameter-decision-tree': ['parameterRiskIntro', '参数风险树', ['对象', '差异', '影响', '回退'], ['#7c3aed', '#2563eb', '#e11d48', '#0f766e']],
  'P10:p10-parameter-governance-loop': ['parameterGateIntro', '参数闸门', ['触发', '边界', '窗口', '留痕'], ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed']],
  'P11:p11-optimization-implementation': ['implementationWaveIntro', '实施波次', ['试点', '执行', '观察', '复测'], ['#16a34a', '#7c3aed', '#0891b2', '#f59e0b']],
  'P12:p12-optimization-validation-loop': ['validationDeltaIntro', '前后验证', ['基线', '动作', '复测', '结论'], ['#e11d48', '#f59e0b', '#2563eb', '#0f766e']],
  'P13:p13-optimization-report-loop': ['reportAssemblyIntro', '报告证据包', ['图表', '日志', '复测', '结论'], ['#2563eb', '#f59e0b', '#7c3aed', '#0f766e']],
  'P14:p14-kpi-source-pipeline': ['kpiSourcePipelineIntro', '数据源管线', ['PM', 'DT', '告警', '基线'], ['#2563eb', '#0f766e', '#e11d48', '#f59e0b']],
  'P15:p15-network-performance-rollout': ['performanceRolloutIntro', '全网推广', ['瓶颈', '策略', '监控', '复盘'], ['#2563eb', '#7c3aed', '#0f766e', '#f59e0b']],
  'P16:p16-validation-delta': ['acceptanceDeltaIntro', '验收差值', ['前值', '目标', '差值', '固化'], ['#e11d48', '#2563eb', '#0f766e', '#f59e0b']],
  'P17:p17-signaling-procedure-ladder': ['signalingProcedureIntro', '信令时序', ['UE', 'gNB', 'AMF', 'UPF'], ['#2563eb', '#0f766e', '#7c3aed', '#e11d48']],
  'P18:p18-signaling-fault-ladder': ['signalingFaultIntro', '故障归因', ['Reject', 'Timer', 'Cause', '复测'], ['#e11d48', '#f59e0b', '#2563eb', '#0f766e']],
};

export function manimProjectExtra(project, templateId) {
  const blueprint = EXTRA_BLUEPRINTS[`${project}:${templateId}`];
  if (!blueprint) return { method: '', call: '' };
  const [methodName, title, labels, colors] = blueprint;
  return {
    call: `        self.${methodName}()\n`,
    method: buildIntroMethod(methodName, title, labels, colors),
  };
}

function buildIntroMethod(methodName, title, labels, colors) {
  return `
    def ${methodName}(self):
        title_chip = RoundedRectangle(width=2.2, height=0.52, corner_radius=0.14, color="${colors[0]}", fill_color="${colors[0]}", fill_opacity=0.12).move_to(LEFT * 3.55 + DOWN * 0.2)
        title_text = self.label("${title}", 18, "${colors[0]}").move_to(title_chip)
        nodes = VGroup()
        for index, name in enumerate(${pyList(labels)}):
            x = -1.35 + index * 1.18
            badge = RoundedRectangle(width=0.94, height=0.58, corner_radius=0.13, color=${pyList(colors)}[index], fill_color=${pyList(colors)}[index], fill_opacity=0.13).move_to(RIGHT * x + DOWN * 0.2)
            marker = Circle(radius=0.12, color=${pyList(colors)}[index], fill_color=${pyList(colors)}[index], fill_opacity=0.82).move_to(badge.get_top() + DOWN * 0.14)
            label = self.label(name, 13, ${pyList(colors)}[index]).move_to(badge.get_center() + DOWN * 0.07)
            nodes.add(VGroup(badge, marker, label))
        links = VGroup(*[Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.06, color="#94a3b8", stroke_width=3, max_tip_length_to_length_ratio=0.15) for i in range(len(nodes) - 1)])
        focus = SurroundingRectangle(nodes, color="${colors[0]}", buff=0.16, corner_radius=0.16)
        page = VGroup(title_chip, title_text, nodes, links, focus)
        self.play(FadeIn(VGroup(title_chip, title_text), shift=RIGHT * 0.12), run_time=0.45)
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.1) for node in nodes], lag_ratio=0.08), run_time=0.9)
        self.play(LaggedStart(*[GrowArrow(link) for link in links], lag_ratio=0.1), Create(focus), run_time=0.85)
        self.play(Indicate(nodes[1], color="${colors[1]}"), run_time=0.55)
        self.play(FadeOut(page, shift=DOWN * 0.18), run_time=0.45)
`;
}

function pyList(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}
