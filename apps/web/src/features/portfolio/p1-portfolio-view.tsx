import Link from 'next/link';
import { Icon } from '../../ui/foundation/icons.tsx';
import { RoleHomeHeader } from '../home/role-home-header.tsx';
import type { P1PortfolioViewModel } from './p1-portfolio-model.ts';

export function P1PortfolioView({
  displayName,
  model,
}: {
  displayName: string;
  model: P1PortfolioViewModel;
}) {
  return (
    <main
      className="role-home-shell p1-portfolio-shell"
      data-motion="paused"
      data-p1-portfolio={model.packageStatus}
      data-primary-action-policy="none"
      data-ui-surface="dark"
    >
      <RoleHomeHeader displayName={displayName} role="student" />
      <div className="p1-portfolio-body">
        <nav aria-label="成果包导航" className="p1-project-breadcrumb">
          <Link href="/student/home">学习首页</Link>
          <Icon name="arrow" size={14} />
          <Link href="/student/projects/p1">{model.projectId} 项目</Link>
          <Icon name="arrow" size={14} />
          <span>项目成果包</span>
        </nav>

        <section className={`p1-portfolio-hero is-${model.packageStatus}`}>
          <div>
            <span className="p1-project-kicker">{model.projectId} · 项目最终产出</span>
            <h1>{model.packageTitle}</h1>
            <p>{model.packageStatus === 'demo-complete'
              ? '以下内容用于展示完整交付形态，均为预置演示数据；学生真实完成三项产出后才形成可交付成果包。'
              : '由 P01、P02、P03 当前职业产出组成；只有三份真实产出均经教师认证，才形成可交付成果包。'}</p>
          </div>
          <aside>
            <span>{model.packageStatusLabel}</span>
            <strong>{model.projectCompositeScoreLabel}</strong>
            <small>项目综合分 · 三个冻结任务综合分等权平均</small>
          </aside>
        </section>

        {model.packageStatus !== 'not-formed' ? (
          <section className="p1-package-reference-strip" aria-label="成果包版本引用">
            <header>
              <Icon name="lock" size={18} />
              <div><span>不可变版本引用</span><strong>成果包不复制第四份内容，只引用三份已认证版本</strong></div>
            </header>
            <ol>
              {model.packageReferences.map((reference) => (
                <li
                  data-p1-package-reference={`${reference.taskId}:${reference.outputId}:v${reference.version}`}
                  key={reference.taskId}
                >
                  <span>{reference.taskId}</span>
                  <strong>v{reference.version}</strong>
                  <small>{reference.outputId}</small>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="p1-package-unformed" data-p1-package-unformed>
            <Icon name="clock" size={22} />
            <div>
              <strong>成果包尚未形成</strong>
              <p>继续完成退回修订、待复核或尚未提交的任务产出。系统不会用草稿、旧版本或模拟分数拼接成果包。</p>
            </div>
          </section>
        )}

        <section className="p1-portfolio-list" aria-labelledby="p1-portfolio-list-title">
          <header>
            <div><span className="p1-project-kicker">三项职业产出</span><h2 id="p1-portfolio-list-title">当前版本与认证状态</h2></div>
            <small>数据快照 · {model.snapshotVersion}</small>
          </header>
          <div>
            {model.items.map((item, index) => (
              <article
                className={`p1-portfolio-item is-${item.status}`}
                data-p1-portfolio-item={item.taskId}
                key={item.taskId}
              >
                <header>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><small>{item.taskId} · {item.taskTitle}</small><h3>{item.outputTitle}</h3></div>
                  <em>{item.statusLabel}</em>
                </header>
                <dl>
                  <div><dt>当前版本</dt><dd>{item.versionLabel}</dd></div>
                  <div><dt>任务综合分</dt><dd>{item.taskCompositeScoreLabel}</dd></div>
                </dl>
                <blockquote>
                  <span><Icon name="message" size={15} />教师反馈</span>
                  <p>{item.teacherFeedback}</p>
                </blockquote>
                <Link
                  className="p1-portfolio-link"
                  data-p1-portfolio-detail-link={item.taskId}
                  href={item.detailHref}
                >
                  {item.detailActionLabel}<Icon name="arrow" size={15} />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <footer className="p1-portfolio-footer">
          <Link href="/student/projects/p1"><Icon name="arrow" size={16} />返回 P1 项目页</Link>
          <span>{model.projectTitle}</span>
        </footer>
      </div>
    </main>
  );
}
