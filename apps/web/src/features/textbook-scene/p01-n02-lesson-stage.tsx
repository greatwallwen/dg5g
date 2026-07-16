'use client';

import React from 'react';
import type { LessonPhase } from '@/platform/models';
import { Icon } from '@/ui/foundation/icons';
import {
  lessonSegmentAt,
  p01n02LessonSegments,
  p01TeachingPackage,
  phaseLabel,
  teachingPageAt,
} from './classroom-lesson-model';

export type LessonStageSurface = 'teacher' | 'student' | 'projector';

export function P01N02LessonStage({ surface, actionIndex = 0, phase = 'prepare' }: {
  surface: LessonStageSurface;
  actionIndex?: number;
  phase?: LessonPhase;
}) {
  const teachingPage = teachingPageAt(actionIndex);
  const segment = lessonSegmentAt(p01n02LessonSegments.findIndex(({ id }) => id === teachingPage.segmentId));
  const segmentIndex = p01n02LessonSegments.indexOf(segment);
  const activeIndex = teachingPage.globalPageNumber - 1;
  const teachingPages = p01TeachingPackage.flatMap(({ pages }) => pages);

  return (
    <article
      className={`p01n02-lesson-stage is-${surface}`}
      data-lesson-node="P1T1-N02"
      data-active-segment={segment.id}
      data-playback-action-index={activeIndex}
      data-suggested-minutes={teachingPage.suggestedMinutes}
      data-teaching-lesson={teachingPage.lessonNumber}
      data-teaching-page={teachingPage.id}
    >
      <header className="p01n02-stage-header">
        <div>
          <span>P01 · P1T1-N02</span>
          <h1>设备拓扑</h1>
          <p>照片怎样证明设备、槽位与端口属于同一条链？</p>
        </div>
        <strong>
          <i />{phaseLabel(phase)}
          <small>第{teachingPage.lessonNumber}课时 · {teachingPage.pageNumber} / 6 · {teachingPage.suggestedMinutes}分钟</small>
        </strong>
      </header>

      <nav className="p01n02-segment-track" aria-label="本节教材结构">
        {teachingPages.map((page, index) => (
          <span aria-current={index === activeIndex ? 'step' : undefined} key={page.id}>
            <b>{page.globalPageNumber}</b>{page.lessonNumber}-{page.pageNumber}
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
          <span
            aria-hidden="true"
            className={`p01n02-scan-focus is-step-${segmentIndex + 1}`}
            data-playback-target={teachingPage.id}
          ><i /><b /></span>
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
            <header><span>{teachingPage.projectorContent.title} · 第{teachingPage.lessonNumber}课时</span><strong>{teachingPage.title}</strong></header>
            <p>{teachingPage.projectorContent.material}</p>
            <ol>{teachingPage.projectorContent.visualCallouts.map((point, index) => <li key={point}><b>{index + 1}</b><span>{point}</span></li>)}</ol>
            <section className="p01n02-reading-check"><Icon name="target" size={19} /><div><span>课堂任务</span><strong>{teachingPage.projectorContent.prompt}</strong></div></section>
            <section className="p01n02-reading-evidence"><Icon name="file" size={19} /><div><span>证据口径</span><strong>{segment.evidence}</strong></div></section>
          </aside>
        ) : (
          <div className="p01n02-projector-caption">
            <span>{teachingPage.projectorContent.title}</span>
            <strong>{teachingPage.title}</strong>
            <p>{teachingPage.projectorContent.material}</p>
            <small>{teachingPage.projectorContent.prompt}</small>
          </div>
        )}
      </div>
    </article>
  );
}
