import type { ActivityPublicDto } from './activity-definition.ts';

export function ActivityControl({ activity, values, order, onValueChange, onOrderChange }: {
  activity: ActivityPublicDto;
  values: Record<string, string>;
  order: string[];
  onValueChange: (key: string, value: string) => void;
  onOrderChange: (value: string[]) => void;
}) {
  if (activity.kind === 'link-reconstruction') {
    return (
      <div className="activity-sequence-builder" data-link-sequence-builder="true">
        <ol>{order.map((id) => <li key={id}>{activity.materials.find((item) => item.id === id)?.label}</li>)}</ol>
        <div>{activity.materials.map((material) => (
          <button
            disabled={order.includes(material.id)}
            key={material.id}
            onClick={() => onOrderChange([...order, material.id])}
            type="button"
          >
            加入下一步：{material.label}
          </button>
        ))}</div>
      </div>
    );
  }

  if (activity.kind === 'structured-record') {
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
    return (
      <ThreeQuestionClassificationBoard
        activity={activity}
        onValueChange={onValueChange}
        values={values}
      />
    );
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

function ThreeQuestionClassificationBoard({
  activity,
  values,
  onValueChange,
}: {
  activity: Extract<ActivityPublicDto, { kind: 'evidence-classification' }>;
  values: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
}) {
  const unassigned = activity.materials.filter((material) => !values[material.id]);
  return (
    <div className="activity-three-question-board" data-three-question-board={activity.id}>
      <header>
        <span>三问分类板</span>
        <strong>先读证据卡，再投到“在哪里 / 是谁 / 连到哪”。</strong>
        <p>点卡片下方的投放按钮即可作答；提交后仍由服务端规则给出反馈和重试路径。</p>
      </header>
      <section className="activity-evidence-card-pool" aria-label="待分类证据卡">
        {(unassigned.length ? unassigned : activity.materials).map((material) => (
          <article data-three-question-card={material.id} key={material.id}>
            <span>{values[material.id] ? '已投放' : '待判断'}</span>
            <strong>{material.label}</strong>
            <p>{material.detail}</p>
            <div>
              {activity.interaction.categories.map((category) => (
                <button
                  aria-pressed={values[material.id] === category.id}
                  key={category.id}
                  onClick={() => onValueChange(material.id, category.id)}
                  type="button"
                >
                  投到：{category.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="activity-three-question-zones" aria-label="三问投放区">
        {activity.interaction.categories.map((category) => {
          const assigned = activity.materials.filter((material) => values[material.id] === category.id);
          return (
            <article data-three-question-dropzone={category.id} key={category.id}>
              <h4>{category.label}</h4>
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
      </section>
    </div>
  );
}
