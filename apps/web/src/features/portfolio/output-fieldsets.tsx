'use client';

import React from 'react';
import type { ProfessionalOutputFieldSource } from '@/platform/professional-output-repository';
import type { P01EvidenceDefinition } from './evidence-library';
import type { ProfessionalOutputFields, ProfessionalOutputSchema } from './output-schema';

export function OutputFieldsets({
  schema,
  values,
  readOnly,
  onFieldChange,
  evidenceLibrary = [],
  evidenceLinks = {},
  fieldSources = [],
  onEvidenceChange = () => {},
}: {
  schema: ProfessionalOutputSchema;
  values: ProfessionalOutputFields;
  readOnly: boolean;
  onFieldChange: (key: string, value: string) => void;
  evidenceLibrary?: P01EvidenceDefinition[];
  evidenceLinks?: Record<string, string[]>;
  fieldSources?: ProfessionalOutputFieldSource[];
  onEvidenceChange?: (fieldKey: string, evidenceIds: string[]) => void;
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
          const selectedEvidence = selectedIds
            .map((evidenceId) => evidenceById.get(evidenceId))
            .filter((evidence): evidence is P01EvidenceDefinition => evidence !== undefined);
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
