import type { ActivityPublicDto } from './activity-definition.ts';
import {
  EvidenceMatchBoard,
  FlipRecordControl,
  LinkPathBoard,
} from './activity-specialized-controls.tsx';

export function ActivityControl({ activity, values, order, onValueChange, onOrderChange }: {
  activity: ActivityPublicDto;
  values: Record<string, string>;
  order: string[];
  onValueChange: (key: string, value: string) => void;
  onOrderChange: (value: string[]) => void;
}) {
  if (activity.kind === 'link-reconstruction') {
    return <LinkPathBoard activity={activity} onOrderChange={onOrderChange} order={order} />;
  }

  if (activity.kind === 'structured-record') {
    if (activity.id === 'P1T1-N02-transfer-01') {
      return <FlipRecordControl activity={activity} onValueChange={onValueChange} values={values} />;
    }
    return (
      <div className="activity-record-form" data-structured-record-form="true">
        {activity.interaction.fields.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <input
              onChange={(event) => onValueChange(field.id, event.target.value)}
              placeholder={field.placeholder}
              type="text"
              value={values[field.id] ?? ''}
            />
          </label>
        ))}
      </div>
    );
  }

  if (activity.kind === 'four-state-judgement') {
    const { categories } = activity.interaction;
    return (
      <table className="activity-state-matrix" data-four-state-matrix="true">
        <thead>
          <tr>
            <th scope="col">证据条件</th>
            {categories.map((category) => <th key={category.id} scope="col">{category.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {activity.materials.map((material) => (
            <tr key={material.id}>
              <th scope="row"><strong>{material.label}</strong><small>{material.detail}</small></th>
              {categories.map((category) => (
                <td key={category.id}>
                  <input
                    aria-label={`${material.label}：${category.label}`}
                    checked={values[material.id] === category.id}
                    name={`${activity.id}-${material.id}`}
                    onChange={() => onValueChange(material.id, category.id)}
                    type="radio"
                    value={category.id}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (activity.kind === 'defective-sheet-revision') {
    const { fields } = activity.interaction;
    return (
      <table className="activity-revision-table" data-defective-sheet-revision="true">
        <thead>
          <tr>
            <th scope="col">缺陷项</th>
            <th scope="col">缺陷原值</th>
            <th scope="col">修订值</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const material = activity.materials[index];
            return (
              <tr key={field.id}>
                <th scope="row">{material?.label ?? field.label}</th>
                <td>{material?.sourceValue ?? material?.detail ?? '—'}</td>
                <td>
                  <label>
                    <input
                      aria-label={field.label}
                      onChange={(event) => onValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      type="text"
                      value={values[field.id] ?? ''}
                    />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (activity.kind === 'evidence-classification' && activity.id === 'P1T1-N02-foundation-01') {
    return <EvidenceMatchBoard activity={activity} onValueChange={onValueChange} values={values} />;
  }

  return (
    <div className="activity-classification-board" data-classification-board={activity.kind}>
      {activity.materials.map((material) => (
        <fieldset key={material.id}>
          <legend><strong>{material.label}</strong><small>{material.detail}</small></legend>
          {activity.interaction.categories.map((category) => (
            <label key={category.id}>
              <input
                checked={values[material.id] === category.id}
                name={`${activity.id}-${material.id}`}
                onChange={() => onValueChange(material.id, category.id)}
                type="radio"
                value={category.id}
              />
              <span>{category.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
