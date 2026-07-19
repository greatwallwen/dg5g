'use client';

import React from 'react';
import type {
  ProfessionalOutputEvidenceGap,
  ProfessionalOutputFieldSource,
} from '@/platform/professional-output-repository';
import type { EvidenceDefinition } from './evidence-library';
import type { ProfessionalOutputFields, ProfessionalOutputSchema } from './output-schema';

export function OutputFieldsets({
  schema,
  values,
  readOnly,
  onFieldChange,
  evidenceLibrary = [],
  evidenceLinks = {},
  evidenceGaps = {},
  fieldSources = [],
  onEvidenceChange = () => {},
  onEvidenceGapChange = () => {},
}: {
  schema: ProfessionalOutputSchema;
  values: ProfessionalOutputFields;
  readOnly: boolean;
  onFieldChange: (key: string, value: string) => void;
  evidenceLibrary?: EvidenceDefinition[];
  evidenceLinks?: Record<string, string[]>;
  evidenceGaps?: Record<string, ProfessionalOutputEvidenceGap>;
  fieldSources?: ProfessionalOutputFieldSource[];
  onEvidenceChange?: (fieldKey: string, evidenceIds: string[]) => void;
  onEvidenceGapChange?: (fieldKey: string, gap: ProfessionalOutputEvidenceGap) => void;
}) {
  const evidenceById = new Map(evidenceLibrary.map((evidence) => [evidence.evidenceId, evidence]));
  return (
    <fieldset className="professional-output-fields" disabled={readOnly}>
      <legend>职业证据字段 · {schema.fields.length} 项必填</legend>
      <div>
        {schema.fields.map((field, index) => {
          const id = `${schema.taskId}-output-${field.key}`;
          const sources = fieldSources.filter(({ fieldKey }) => fieldKey === field.key);
          const selectedIds = evidenceLinks[field.key] ?? [];
          const evidenceGap = evidenceGaps[field.key] ?? { gapText: '', nextActionText: '' };
          const hasCompleteGap = Boolean(evidenceGap.gapText.trim() && evidenceGap.nextActionText.trim());
          const selectedEvidence = selectedIds
            .map((evidenceId) => evidenceById.get(evidenceId))
            .filter((evidence): evidence is EvidenceDefinition => evidence !== undefined);
          const availableEvidence = evidenceLibrary.filter((evidence) => (
            evidence.allowedFieldKeys.some((fieldKey) => fieldKey === field.key)
            && !selectedIds.includes(evidence.evidenceId)
          ));
          return (
            <article data-output-field={field.key} key={field.key}>
              <label htmlFor={id}><b>{String(index + 1).padStart(2, '0')}</b><strong>{field.label}</strong><em>必填</em></label>
              {sources.length > 0 ? <ul aria-label={`${field.label}字段来源`} className="professional-output-sources">
                {sources.map((source) => <li data-output-source={`${source.sourceNodeId}:${source.sourceAttemptId}`} key={`${source.sourceNodeId}:${source.sourceAttemptId}`}><span>{source.sourceNodeId}</span><small>活动结果</small></li>)}
              </ul> : null}
              <textarea
                id={id}
                name={field.key}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
                placeholder={`请填写并注明可回查证据：${field.label}`}
                readOnly={readOnly}
                required={field.required}
                value={displayValue(values[field.key])}
              />
              {(selectedEvidence.length > 0 || availableEvidence.length > 0) ? <section className="professional-output-evidence" data-evidence-picker={field.key}>
                <header><strong>字段证据</strong><small>{selectedEvidence.length} 项已挂接</small></header>
                {selectedEvidence.length > 0 ? <ul>
                  {selectedEvidence.map((evidence) => <li data-evidence-id={evidence.evidenceId} key={evidence.evidenceId}>
                    <a aria-label={`预览证据：${evidence.title}`} href={evidence.assetUrl} rel="noreferrer" target="_blank">
                      <img alt="" loading="lazy" src={evidence.assetUrl} />
                      <span><strong>{evidence.title}</strong><small>{evidence.metadata.annotation}</small></span>
                    </a>
                    {!readOnly ? <button aria-label={`移除证据：${evidence.title}`} data-evidence-remove={evidence.evidenceId} onClick={() => onEvidenceChange(field.key, selectedIds.filter((id) => id !== evidence.evidenceId))} type="button">移除</button> : null}
                  </li>)}
                </ul> : null}
                {!readOnly && availableEvidence.length > 0 ? <label>
                  <span>挂接内置证据</span>
                  <select aria-label={`${field.label}挂接内置证据`} defaultValue="" onChange={(event) => {
                    if (!event.target.value) return;
                    onEvidenceChange(field.key, [...selectedIds, event.target.value]);
                  }}>
                    <option disabled value="">选择可用于本字段的证据</option>
                    {availableEvidence.map((evidence) => <option key={evidence.evidenceId} value={evidence.evidenceId}>{evidence.title}</option>)}
                  </select>
                </label> : null}
              </section> : null}
              <section
                className="professional-output-evidence-gap"
                data-evidence-gap={field.key}
                data-gap-complete={hasCompleteGap}
              >
                <header>
                  <strong>证据缺口登记</strong>
                  <small>{selectedIds.length > 0 ? '已挂接证据，可选填' : hasCompleteGap ? '缺口与补证动作已完整' : '无证据时两项必填'}</small>
                </header>
                <p>该字段必须挂接可复核证据；暂时缺证时，请同时说明缺口和下一步补证动作。</p>
                <div>
                  <label htmlFor={`${id}-gap`}>
                    <span>证据缺口</span>
                    <textarea
                      aria-label={`${field.label}：证据缺口`}
                      id={`${id}-gap`}
                      name={`${field.key}.gapText`}
                      onChange={(event) => onEvidenceGapChange(field.key, {
                        ...evidenceGap,
                        gapText: event.target.value,
                      })}
                      placeholder="例：铭牌被遮挡，当前照片无法确认设备型号"
                      readOnly={readOnly}
                      value={evidenceGap.gapText}
                    />
                  </label>
                  <label htmlFor={`${id}-next-action`}>
                    <span>下一步补证动作</span>
                    <textarea
                      aria-label={`${field.label}：下一步补证动作`}
                      id={`${id}-next-action`}
                      name={`${field.key}.nextActionText`}
                      onChange={(event) => onEvidenceGapChange(field.key, {
                        ...evidenceGap,
                        nextActionText: event.target.value,
                      })}
                      placeholder="例：清理遮挡后补拍铭牌近景，并复核型号字段"
                      readOnly={readOnly}
                      value={evidenceGap.nextActionText}
                    />
                  </label>
                </div>
              </section>
              <small>字段标识 · {field.key}</small>
            </article>
          );
        })}
      </div>
    </fieldset>
  );
}

function displayValue(value: ProfessionalOutputFields[string] | undefined): string {
  if (Array.isArray(value)) return value.join('\n');
  return value === undefined ? '' : String(value);
}
