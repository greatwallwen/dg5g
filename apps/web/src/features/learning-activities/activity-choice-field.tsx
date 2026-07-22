import type { ActivityField } from './activity-definition.ts';

const fieldChoices: Record<string, Record<string, readonly string[]>> = {
  'P1T1-N02-transfer-01': {
    siteId: ['HY-01', 'HY-02', 'HY-03'],
    roomId: ['01', '02', '03'],
    cabinetId: ['K02', 'K01', 'K03'],
    deviceId: ['BBU-01', 'AAU-01', 'ODF-01'],
    nearPort: ['BBU-1/0', 'BBU-1/1', 'AAU-1'],
    farPort: ['AAU-1', 'AAU-2', 'BBU-1/0'],
  },
  'P1T1-N02-remediation-revision-01': {
    sourceEvidenceRevision: [
      '原表缺少字段来源，补充设备铭牌 IMG-031 和源端口 IMG-032。',
      '原表结论已经完整，不需要补充字段来源。',
      '补充一张机房全景照片即可证明全部设备和端口字段。',
    ],
    photoIndexRevision: [
      '设备对应 IMG-031，源端口对应 IMG-032，对端口对应 IMG-033。',
      '设备、源端口和对端口统一备注为“见现场照片”。',
      '只把 IMG-031 挂到整条链路，不区分设备和端口字段。',
    ],
    directionRevision: [
      '连接方向为源端 BBU-01 CPRI-1 至对端 AAU-01 OPT-1。',
      '链路状态写成“已连接”，不再记录两端端口。',
      '仅记录 AAU-01，源端设备和端口留待以后补充。',
    ],
  },
  'P1T1-N02-remediation-conclusion-01': {
    confirmedFact: [
      '设备铭牌可识别，源端口照片清晰，已确认设备身份和源端口。',
      '对端口编号已经确认，整条链路可以直接交付。',
      '现场所有设备和端口均无异常。',
    ],
    evidenceGap: [
      '对端端口照片模糊，当前无法确认对端端口编号。',
      '设备铭牌清晰，因此不存在任何证据缺口。',
      '机房全景照片不美观，需要重新拍摄。',
    ],
    risk: [
      '直接下结论存在链路误判风险，会影响成果交付。',
      '照片模糊只影响版面，不影响端口和链路结论。',
      '先填写“已连接”，后续无需再复核。',
    ],
    action: [
      '补拍对端端口照片并复核编号后再更新记录。',
      '沿用现有模糊照片，直接提交结果。',
      '删除对端端口字段，避免出现缺项。',
    ],
  },
  'P1T1-N04-micro-01': {
    duplicatePhotoId: ['IMG-024B', 'IMG-025', 'IMG-024'],
    missingSource: ['IMG-021', 'IMG-022', 'IMG-099'],
    openGap: [
      'GAP-03：补拍接地线与接地排标识。',
      'GAP-03：保持“未拍到”，不安排补证。',
      '删除 GAP-03，按证据齐全归档。',
    ],
  },
  'P1T2-N01-micro-01': {
    response: [
      '采用站点坐标统一底图，标出三个扇区方向、道路热点 H1/H2、邻区边界和本次采样范围。',
      '只标出站点位置和道路名称，采样范围由现场人员自行决定。',
      '把整张地图都作为采样范围，不区分扇区、热点和邻区边界。',
    ],
  },
  'P1T2-N02-foundation-01': {
    response: [
      '扇区2方位角以正北为基准，机械下倾用支架刻度，电下倾读取 RET，挂高从地面起算并绑定照片。',
      '方位角、两类下倾和挂高都以现场目测结果为准，不需要记录基准。',
      '只拍天线全景，用同一张照片代替罗盘、支架、RET 和挂高证据。',
    ],
  },
  'P1T2-N02-application-01': {
    response: [
      '扇区2方位角120度与投诉路段125度接近，机械下倾2度、电下倾4度和挂高32米支持主瓣方向判断；仍需补罗盘基准与 RET 采集时间。',
      '方位角数值接近即可确认覆盖正常，不必核对下倾、挂高和采集时间。',
      '投诉道路中心线为125度，所以把扇区方位角直接改成125度即可。',
    ],
  },
  'P1T2-N02-transfer-01': {
    response: [
      '不拆美化罩，先用站点工单和扇区标签确认身份，再用罗盘测向、RET 网管参数和挂高测量交叉复核，并把遮挡与不确定性登记为待复核。',
      '拆开美化罩直接观察天线，现场口头确认方位角和下倾角。',
      '只读取网管参数，忽略扇区身份、现场方向、挂高和周边遮挡。',
    ],
  },
  'P1T2-N03-micro-01': {
    response: [
      '照片显示扇区主瓣120度指向东南，遮挡楼体位于热点 H2 前方；在楼体两侧设置风险点和对照点采样，结论为待验证遮挡假设。',
      '看到楼体即可确认投诉由遮挡造成，不需要设置对照点或继续验证。',
      '选择画面最清晰的一张照片作为结论，忽略主瓣方向和热点位置。',
    ],
  },
  'P1T2-N04-micro-01': {
    response: [
      '选择路线B：路线穿越遮挡风险边界，在 H2 设置 CQT 热点点位并在楼体两侧设置对照点，规定18:00-19:00采样 RSRP 和 SINR 作为验收指标。',
      '选择路线A：避开风险区可以更快完成采样，不需要设置热点和对照点。',
      '选择路线C：只在热点采样，不记录时间、RSRP、SINR 或对照数据。',
    ],
  },
  'P1T3-N01-micro-01': {
    response: [
      '事实：18:00-19:00在A座18层会议室使用视频会议时5次中4次卡顿；仍缺终端型号和5G模式，需要追问并按同地点同业务条件复测。',
      '用户已经说明“经常卡顿”，可以直接判定为网络覆盖故障。',
      '只记录用户姓名和联系电话，时间、地点、业务、终端条件在复测时再问。',
    ],
  },
  'P1T3-N02-foundation-01': {
    response: [
      '记录A满足同地点、同业务、同终端；记录B地点不同，记录C业务不同，记录D终端不同。后三份条件不等价，不能写成未复现。',
      '四份记录都进行了测试，因此都可以与原投诉直接比较并写成未复现。',
      '只要测试地点相同，业务和终端是否一致都不影响复现结论。',
    ],
  },
  'P1T3-N02-application-01': {
    response: [
      '0-2分钟确认地点、终端和视频会议业务；2-12分钟重复入会并记录卡顿时刻；全程采集服务小区、RSRP、SINR和业务日志；12-15分钟复核时间轴。',
      '15分钟内反复打开网页测速，只记录最高下载速率作为投诉复测结果。',
      '先采集网络指标，几天后再补做视频会议，最后按大致时间合并两份记录。',
    ],
  },
  'P1T3-N02-transfer-01': {
    response: [
      '按相同车次和运行区段复测，保持通话业务与终端一致，记录沿途服务小区、切换轨迹和掉线时刻，并用相同时间段重复路线。',
      '在任意车站静止拨打一次电话，未掉线即可判定原投诉无法复现。',
      '更换车次、路线、终端和业务进行测试，只比较最终是否掉线。',
    ],
  },
  'P1T3-N03-micro-01': {
    response: [
      '将18:07业务卡顿日志、同时窗 SINR -3dB、服务小区拥塞 KPI 和告警放到统一时间轴；业务侧与网络侧独立来源共同支持假设，同时保留无告警这条冲突线索。',
      '只看18:07的业务日志即可确认网络拥塞，无需核对SINR、KPI或告警。',
      '告警系统没有当前告警，因此可以删除业务卡顿和网络指标记录。',
    ],
  },
  'P1T3-N04-micro-01': {
    response: [
      '依据业务日志与网络 KPI 形成可派单结论：由无线优化负责人在24小时内复核拥塞参数，完成后按同地点同业务同终端复测并回访用户，以卡顿不再复现作为闭环验收。',
      '处理建议写“建议优化”，不指定证据、负责人、时限和验收方法。',
      '直接关闭工单，等用户再次投诉后再决定是否复测和回访。',
    ],
  },
};

const scopeReasonChoices: Record<string, readonly string[]> = {
  'room-01-cabinets': [
    '任务单明确包含01号机房K01-K04，应纳入采集，不能作为排除对象。',
    '设备数量较多，现场时间不足，所以先排除。',
    '机柜靠近入口，因此不属于本次任务。',
  ],
  'shared-operator-cabinet': [
    '柜门标识属于其他运营商，不能混入本次任务台账。',
    '设备外观与本项目机柜不同，先按经验排除。',
    '机柜距离入口较远，因此不需要采集。',
  ],
  'room-02-cabinets': [
    '02号机房不在任务单指定的01号机房范围内，本次排除。',
    '02号机房设备较少，因此可以直接排除。',
    '现场照片不够清晰，所以不登记02号机房。',
  ],
};

export function ActivityChoiceField({
  activityId,
  field,
  value,
  onValueChange,
  compact = false,
}: {
  activityId: string;
  field: ActivityField;
  value: string;
  onValueChange: (value: string) => void;
  compact?: boolean;
}) {
  const options = rotateChoices(choicesForActivityField(activityId, field.id), `${activityId}/${field.id}`);
  if (compact) {
    return (
      <fieldset className="activity-choice-field is-compact" data-choice-field={field.id}>
        <legend>{field.label}</legend>
        <select
          aria-label={field.label}
          onChange={(event) => onValueChange(event.target.value)}
          value={value}
        >
          <option disabled value="">请选择</option>
          {options.map((option, index) => (
            <option key={option} value={option}>{String.fromCharCode(65 + index)}. {option}</option>
          ))}
        </select>
      </fieldset>
    );
  }
  return (
    <fieldset className="activity-choice-field" data-choice-field={field.id}>
      <legend>{field.label}</legend>
      <div>
        {options.map((option, index) => (
          <button
            aria-pressed={value === option}
            data-choice-option={`${field.id}-${index + 1}`}
            key={option}
            onClick={() => onValueChange(option)}
            type="button"
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function choicesForActivityField(activityId: string, fieldId: string): readonly string[] {
  const options = fieldChoices[activityId]?.[fieldId];
  if (!options) throw new Error(`Missing choice options for activity field: ${activityId}/${fieldId}.`);
  return options;
}

export function choicesForScopeReason(materialId: string): readonly string[] {
  const options = scopeReasonChoices[materialId];
  if (!options) throw new Error(`Missing scope reason choices for material: ${materialId}.`);
  return options;
}

export function rotateChoices(options: readonly string[], seed: string): readonly string[] {
  const offset = [...seed].reduce((total, character) => total + character.codePointAt(0)!, 0) % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
}
