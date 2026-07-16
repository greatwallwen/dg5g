'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../ui/foundation/icons.tsx';
import {
  selfStudySectionDefinitions,
  type SelfStudyDocument,
  type SelfStudySectionId,
} from './self-study-types.ts';
import { FigureSection, ProblemSection, SelfStudyGlossary, StepsSection } from './self-study-primary-sections.tsx';
import { PracticeSection, practiceIdsFor } from './self-study-practice-section.tsx';
import { CorrectionSection, OutputSection } from './self-study-secondary-sections.tsx';

export function SelfStudyRenderer({ document, completed, saving, onComplete }: {
  document: SelfStudyDocument;
  completed: boolean;
  saving: boolean;
  onComplete: () => void;
}) {
  const [activeSection, setActiveSection] = useState<SelfStudySectionId>('problem');
  const [passedPracticeIds, setPassedPracticeIds] = useState<string[]>([]);
  const textbookBodyRef = useRef<HTMLDivElement>(null);
  const activeIndex = selfStudySectionDefinitions.findIndex(({ id }) => id === activeSection);
  const practiceIds = useMemo(() => practiceIdsFor(document), [document]);
  const practiceComplete = completed || practiceIds.every((id) => passedPracticeIds.includes(id));

  useEffect(() => {
    setActiveSection('problem');
    setPassedPracticeIds([]);
  }, [document.nodeId]);

  useEffect(() => {
    const onPlaybackTarget = (event: Event) => {
      const targetId = (event as CustomEvent<{ targetId?: string }>).detail?.targetId;
      const section = selfStudySectionDefinitions.find(({ playbackTarget }) => playbackTarget === targetId);
      if (section) setActiveSection(section.id);
    };
    window.addEventListener('dgbook:playback-target', onPlaybackTarget);
    return () => window.removeEventListener('dgbook:playback-target', onPlaybackTarget);
  }, []);

  useEffect(() => {
    const active = textbookBodyRef.current?.querySelector<HTMLElement>(
      `[data-self-study-section="${activeSection}"]`,
    );
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }, [activeSection]);

  function moveSection(offset: number) {
    const nextIndex = Math.max(0, Math.min(selfStudySectionDefinitions.length - 1, activeIndex + offset));
    setActiveSection(selfStudySectionDefinitions[nextIndex]!.id);
  }

  function markPracticePassed(practiceId: string) {
    setPassedPracticeIds((current) => current.includes(practiceId) ? current : [...current, practiceId]);
  }

  return (
    <article
      className="learning-scene self-study-renderer"
      data-image2-learning-stage="true"
      data-learning-unit={document.sourceKnowledgeUnitId}
      data-motion="paused"
      data-node-id={document.nodeId}
      data-primary-action-policy="exactly-one"
      data-self-study-node={document.nodeId}
      data-self-study-renderer={document.nodeId}
    >
      <header className="learning-scene-head self-study-head">
        <div><span>{document.taskId} · {document.nodeId}</span><h1>{document.nodeTitle}</h1></div>
        <nav aria-label="自学内容六段导航">
          {selfStudySectionDefinitions.map(({ id, label }, index) => (
            <button
              aria-current={activeSection === id ? 'step' : undefined}
              className={activeSection === id ? 'is-active' : index < activeIndex ? 'is-past' : ''}
              data-self-study-section-tab={id}
              key={id}
              onClick={() => setActiveSection(id)}
              type="button"
            >
              <i>{index + 1}</i><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="learning-unit-output"><small>本节点记录</small><strong>汇入 {document.taskOutputTitle}</strong></div>
      </header>

      <div className="self-study-workspace">
        <div className="self-study-sections self-study-textbook-body" ref={textbookBodyRef}>
          <StudySection active={activeSection === 'problem'} document={document} id="problem"><ProblemSection document={document} /></StudySection>
          <StudySection active={activeSection === 'figure'} document={document} id="figure"><FigureSection document={document} /></StudySection>
          <StudySection active={activeSection === 'steps'} document={document} id="steps"><StepsSection document={document} /></StudySection>
          <StudySection active={activeSection === 'correction'} document={document} id="correction"><CorrectionSection document={document} /></StudySection>
          <StudySection active={activeSection === 'practice'} document={document} id="practice">
            <PracticeSection document={document} onPass={markPracticePassed} passedIds={passedPracticeIds} />
          </StudySection>
          <StudySection active={activeSection === 'output'} document={document} id="output"><OutputSection document={document} /></StudySection>
        </div>
        <SelfStudyGlossary terms={document.content.glossary} />
      </div>

      <footer className="learning-scene-footer self-study-footer">
        <div>
          <button aria-label="上一学习段" disabled={activeIndex === 0} onClick={() => moveSection(-1)} type="button"><Icon name="arrow" size={16} /></button>
          <span>{activeIndex + 1} / {selfStudySectionDefinitions.length}</span>
          <button aria-label="下一学习段" disabled={activeIndex === selfStudySectionDefinitions.length - 1} onClick={() => moveSection(1)} type="button"><Icon name="arrow" size={16} /></button>
        </div>
        <span><Icon name={completed ? 'check' : practiceComplete ? 'spark' : 'target'} size={17} />{completed ? '该能力节点已达成' : practiceComplete ? '分层练习已完成，可记录本节点学习' : '可自由阅读；完成练习后记录学习进度'}</span>
        {activeSection === 'output' ? (
          <button data-primary-action="true" disabled={!practiceComplete || saving} onClick={onComplete} type="button">
            {saving ? '正在记录' : completed ? '继续下一节点' : '记录本节点学习完成'}<Icon name="arrow" size={17} />
          </button>
        ) : (
          <button className="is-next" data-primary-action="true" disabled={activeIndex === selfStudySectionDefinitions.length - 1} onClick={() => moveSection(1)} type="button">下一段<Icon name="arrow" size={17} /></button>
        )}
      </footer>
    </article>
  );
}

function StudySection({ id, active, document, children }: {
  id: SelfStudySectionId;
  active: boolean;
  document: SelfStudyDocument;
  children: ReactNode;
}) {
  const definition = selfStudySectionDefinitions.find((item) => item.id === id)!;
  return (
    <section
      aria-labelledby={`${document.nodeId}-${id}-title`}
      className={`self-study-section is-${id}${active ? ' is-active' : ''}`}
      data-playback-target={definition.playbackTarget}
      data-self-study-section={id}
      hidden={!active}
    >
      {children}
    </section>
  );
}
