'use client';

import React from 'react';
import type { ProfessionalOutputFields, ProfessionalOutputSchema } from './output-schema';

export function OutputFieldsets({
  schema,
  values,
  readOnly,
  onFieldChange,
}: {
  schema: ProfessionalOutputSchema;
  values: ProfessionalOutputFields;
  readOnly: boolean;
  onFieldChange: (key: string, value: string) => void;
}) {
  return (
    <fieldset className="professional-output-fields" disabled={readOnly}>
      <legend>职业证据字段 · {schema.fields.length} 项必填</legend>
      <div>
        {schema.fields.map((field, index) => {
          const id = `${schema.taskId}-output-${field.key}`;
          return (
            <label data-output-field={field.key} htmlFor={id} key={field.key}>
              <span><b>{String(index + 1).padStart(2, '0')}</b><strong>{field.label}</strong><em>必填</em></span>
              <textarea
                id={id}
                name={field.key}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
                placeholder={`请填写并注明可回查证据：${field.label}`}
                readOnly={readOnly}
                required={field.required}
                value={displayValue(values[field.key])}
              />
              <small>字段标识 · {field.key}</small>
            </label>
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
