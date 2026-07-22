'use client';

import { useState } from 'react';
import type { ActivityPublicDto } from './activity-definition.ts';
import { ActivityChoiceField } from './activity-choice-field.tsx';

export function LinkPathBoard({
  activity,
  order,
  onOrderChange,
}: {
  activity: Extract<ActivityPublicDto, { kind: 'link-reconstruction' }>;
  order: string[];
  onOrderChange: (value: string[]) => void;
}) {
  return (
    <div className="activity-link-path-board" data-link-path-board="true" data-link-sequence-builder="true">
      <header>
        <span>链路拼图</span>
        <strong>按线缆标签从本端一路接到对端。</strong>
        <p>先找起点，再看跳纤编号是否连续，最后确认对端端口。</p>
      </header>
      <ol aria-label="链路顺序" className="activity-link-path-lane">
        {activity.materials.map((material, index) => {
          const chosen = activity.materials.find((item) => item.id === order[index]);
          return (
            <li data-link-path-slot={index + 1} key={material.id}>
              <span>第 {index + 1} 步</span>
              <strong>{chosen?.label ?? '等待选择'}</strong>
              <small>{chosen?.detail ?? '从下方证据卡中选择下一段链路。'}</small>
            </li>
          );
        })}
      </ol>
      <div className="activity-link-candidates" aria-label="可选链路证据">
        {activity.materials.map((material) => (
          <button
            aria-pressed={order.includes(material.id)}
            data-link-path-candidate={material.id}
            disabled={order.includes(material.id)}
            key={material.id}
            onClick={() => onOrderChange([...order, material.id])}
            type="button"
          >
            <strong>{material.label}</strong>
            <span>{material.detail}</span>
          </button>
        ))}
      </div>
      {order.length ? (
        <button className="activity-inline-reset" onClick={() => onOrderChange([])} type="button">重新排列链路</button>
      ) : null}
    </div>
  );
}

export function FlipRecordControl({
  activity,
  values,
  onValueChange,
}: {
  activity: Extract<ActivityPublicDto, { kind: 'structured-record' }>;
  values: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const material = activity.materials[0];
  return (
    <div className="activity-flip-record" data-record-flip-card={activity.id}>
      <button
        aria-expanded={revealed}
        className="activity-flip-card"
        onClick={() => setRevealed((current) => !current)}
        type="button"
      >
        <span>{revealed ? '收起证据提示' : '翻开证据提示'}</span>
        <strong>{material.label}</strong>
        <p>{revealed ? material.detail : '先想一想：记录一条链路，至少要写清站点、设备和两端端口。'}</p>
      </button>
      <div className="activity-record-form" data-record-evidence-form="true" data-structured-record-form="true">
        {activity.interaction.fields.map((field) => (
          <ActivityChoiceField
            activityId={activity.id}
            compact={activity.interaction.fields.length > 1}
            field={field}
            key={field.id}
            onValueChange={(value) => onValueChange(field.id, value)}
            value={values[field.id] ?? ''}
          />
        ))}
      </div>
    </div>
  );
}

export function EvidenceMatchBoard({
  activity,
  values,
  onValueChange,
}: {
  activity: Extract<ActivityPublicDto, { kind: 'evidence-classification' }>;
  values: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
}) {
  const firstOpen = activity.materials.find((material) => !values[material.id]) ?? activity.materials[0];
  const [selectedId, setSelectedId] = useState(firstOpen.id);
  const selected = activity.materials.find((material) => material.id === selectedId) ?? firstOpen;
  function assign(categoryId: string) {
    onValueChange(selected.id, categoryId);
    const next = activity.materials.find((material) => material.id !== selected.id && !values[material.id]);
    if (next) setSelectedId(next.id);
  }
  return (
    <div
      className="activity-evidence-match-board activity-three-question-board"
      data-evidence-match-board={activity.id}
      data-three-question-board={activity.id}
    >
      <header>
        <span>证据连连看</span>
        <strong>先选一张证据卡，再选择它能直接证明的问题。</strong>
        <p>一张照片不是什么都能证明。把它连到“在哪里 / 是谁 / 连到哪”中的一个问题，再看证据是否足够。</p>
      </header>
      <section className="activity-evidence-match-layout">
        <div className="activity-evidence-card-pool" aria-label="待分类证据卡">
          {activity.materials.map((material) => (
            <article
              className={selected.id === material.id ? 'is-selected' : values[material.id] ? 'is-assigned' : ''}
              data-evidence-match-card={material.id}
              data-three-question-card={material.id}
              key={material.id}
            >
              <span>{values[material.id] ? '已连接' : selected.id === material.id ? '正在判断' : '待判断'}</span>
              <strong>{material.label}</strong>
              <p>{material.detail}</p>
              <button aria-pressed={selected.id === material.id} onClick={() => setSelectedId(material.id)} type="button">选择这张卡</button>
            </article>
          ))}
        </div>
        <div className="activity-evidence-targets activity-three-question-zones" aria-label="三问投放区">
          {activity.interaction.categories.map((category) => {
            const assigned = activity.materials.filter((material) => values[material.id] === category.id);
            return (
              <article data-evidence-match-target={category.id} data-three-question-dropzone={category.id} key={category.id}>
                <h4>{category.label}</h4>
                <button aria-pressed={values[selected.id] === category.id} onClick={() => assign(category.id)} type="button">连到这里</button>
                {assigned.length ? (
                  <ul>{assigned.map((material) => (
                    <li key={material.id}>
                      <strong>{material.label}</strong>
                      <button onClick={() => onValueChange(material.id, '')} type="button">撤回</button>
                    </li>
                  ))}</ul>
                ) : <p>还没有证据卡。想想：这类证据能证明什么，不能证明什么？</p>}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
