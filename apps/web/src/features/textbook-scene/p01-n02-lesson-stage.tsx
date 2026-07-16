'use client';

import type { LessonPhase } from '@/platform/models';
import { Icon } from '@/ui/foundation/icons';
import { lessonSegmentAt, p01n02LessonSegments, phaseLabel } from './classroom-lesson-model';

export type LessonStageSurface = 'teacher' | 'student' | 'projector';

export function P01N02LessonStage({ surface, actionIndex = 0, phase = 'prepare' }: {
  surface: LessonStageSurface;
  actionIndex?: number;
  phase?: LessonPhase;
}) {
  const segment = lessonSegmentAt(actionIndex);
  const activeIndex = p01n02LessonSegments.indexOf(segment);

  return (
    <article
      className={`p01n02-lesson-stage is-${surface}`}
      data-lesson-node="P1T1-N02"
      data-active-segment={segment.id}
      data-playback-action-index={activeIndex}
    >
      <header className="p01n02-stage-header">
        <div>
          <span>P01 · P1T1-N02</span>
          <h1>设备拓扑</h1>
          <p>照片怎样证明设备、槽位与端口属于同一条链？</p>
        </div>
        <strong><i />{phaseLabel(phase)}<small>{activeIndex + 1} / {p01n02LessonSegments.length}</small></strong>
      </header>

      <nav className="p01n02-segment-track" aria-label="本节教材结构">
        {p01n02LessonSegments.map((item, index) => (
          <span aria-current={index === activeIndex ? 'step' : undefined} key={item.id}>
            <b>{index + 1}</b>{item.label}
          </span>
        ))}
      </nav>

      <div className="p01n02-stage-body">
        <figure className="p01n02-topology-figure" aria-labelledby="p01n02-topology-caption">
          <img src="/media/5g/p01-n02-topology-stage-v1.png" alt="机柜02、BBU槽位3、AAU/RRU、端口、负48伏供电与接地组成的5G室内设备拓扑" />
          <span className="p01n02-object-label is-cabinet"><b>机柜02</b><small>CAB-02 · B1西区</small></span>
          <span className="p01n02-object-label is-bbu"><b>BBU槽位3</b><small>BBU5900 · 210235A8K12345</small></span>
          <span className="p01n02-object-label is-aau"><b>AAU/RRU</b><small>AAU5619 · 20235AA98765</small></span>
          <span className="p01n02-object-label is-port"><b>端口链</b><small>P1-P4 · TX/RX</small></span>
          <span className={`p01n02-scan-focus is-step-${activeIndex + 1}`} aria-hidden="true"><i /><b /></span>
          {p01n02LessonSegments.map((item) => <span className={`p01n02-focus-anchor is-${item.id}`} data-playback-target={item.id} key={item.id} />)}
          <figcaption id="p01n02-topology-caption">
            <span><i className="is-fiber" />光纤链路</span>
            <span><i className="is-rf" />射频链路</span>
            <span><i className="is-power" />-48V供电</span>
            <span><i className="is-ground" />保护接地</span>
          </figcaption>
        </figure>

        {surface !== 'projector' ? (
          <aside className="p01n02-reading-panel" aria-label="当前教材正文">
            <header><span>{segment.eyebrow}</span><strong>{segment.title}</strong></header>
            <p>{segment.lead}</p>
            <ol>{segment.points.map((point, index) => <li key={point}><b>{index + 1}</b><span>{point}</span></li>)}</ol>
            <section className="p01n02-reading-check"><Icon name="target" size={19} /><div><span>思考检查</span><strong>{segment.checkpoint}</strong></div></section>
            <section className="p01n02-reading-evidence"><Icon name="file" size={19} /><div><span>证据口径</span><strong>{segment.evidence}</strong></div></section>
          </aside>
        ) : (
          <div className="p01n02-projector-caption"><span>{segment.eyebrow}</span><strong>{segment.title}</strong><p>{segment.checkpoint}</p></div>
        )}
      </div>
    </article>
  );
}
