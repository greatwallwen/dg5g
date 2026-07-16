import Link from 'next/link';
import { Icon, type IconName } from '@/ui/foundation/icons';
import '../../app/platform-overview.css';
import type { PublicPlatformCard, PublicPlatformModel } from './public-platform-model.ts';

export type PublicPlatformSection = 'platform' | 'resources' | 'governance' | 'delivery';

interface PublicPlatformViewProps {
  model: PublicPlatformModel;
  section: PublicPlatformSection;
}

const sectionCopy: Record<PublicPlatformSection, { eyebrow: string; title: string; summary: string }> = {
  platform: {
    eyebrow: 'P1 PRODUCTION CHAIN',
    title: '从教材源到教学应用的完整生产链',
    summary: '以固定 P1 样例说明内容如何诊断、生成、治理并进入数字教材。此区域匿名可见且全程只读。',
  },
  resources: {
    eyebrow: 'RESOURCE CATALOG',
    title: '可核对的 P1 资源生产摘要',
    summary: '只展示材料、知识单元、资源类型、教材挂接位置与缩略预览，不公开完整教材内容。',
  },
  governance: {
    eyebrow: 'QUALITY GOVERNANCE',
    title: '发布前质量门禁与版本状态',
    summary: '公开门禁类别和脱敏状态，答案、原始路径、内部日志与授权内容均保留在登录域。',
  },
  delivery: {
    eyebrow: 'DELIVERY MODES',
    title: '资源包与数字教材双交付',
    summary: '查看清单级摘要与直接挂接方式；匿名访客不能下载完整资源包，也不能触发生产操作。',
  },
};

const navigation: Array<{ section: PublicPlatformSection; href: string; label: string }> = [
  { section: 'platform', href: '/platform', label: '平台总览' },
  { section: 'resources', href: '/resources', label: '资源目录' },
  { section: 'governance', href: '/governance', label: '审核治理' },
  { section: 'delivery', href: '/delivery', label: '交付方式' },
];

export function PublicPlatformView({ model, section }: PublicPlatformViewProps) {
  const copy = sectionCopy[section];
  const cards = section === 'platform' ? model.stages : model[section];

  return (
    <main
      className="public-platform"
      data-motion="paused"
      data-primary-action-policy="exactly-one"
      data-public-access="anonymous-read-only"
      data-public-platform={section}
      data-ui-surface="dark"
    >
      <header className="public-platform-header">
        <Link className="public-platform-brand" href="/platform" aria-label="DGBook 平台总览">
          <span>DG</span>
          <p><strong>DGBook</strong><small>数字教材生产与应用平台</small></p>
        </Link>
        <nav aria-label="公开平台导航">
          {navigation.map((item) => (
            <Link
              aria-current={section === item.section ? 'page' : undefined}
              href={item.href}
              key={item.section}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="public-platform-login" data-primary-action href="/">
          登录进入教材 <Icon name="arrow" size={17} />
        </Link>
      </header>

      <section className="public-platform-hero" aria-labelledby="public-platform-title">
        <div>
          <span>{copy.eyebrow}</span>
          <h1 id="public-platform-title">{copy.title}</h1>
          <p>{copy.summary}</p>
        </div>
        <dl aria-label="公开访问范围">
          <div><dt>访问模式</dt><dd>匿名只读</dd></div>
          <div><dt>展示样例</dt><dd>P1 · 5G网络信息采集</dd></div>
          <div><dt>受保护域</dt><dd>教材全文 · 教学内容 · 学习事实</dd></div>
        </dl>
      </section>

      <section className={`public-platform-content is-${section}`} aria-label={copy.title}>
        <header>
          <div>
            <span>{section === 'platform' ? '08 STAGES' : `${String(cards.length).padStart(2, '0')} PUBLIC CARDS`}</span>
            <h2>{section === 'platform' ? '生产链路' : '脱敏公开清单'}</h2>
          </div>
          <p><Icon name="lock" size={16} /> 仅公开白名单字段，不连接学习数据库</p>
        </header>
        {section === 'platform'
          ? <StageFlow cards={cards} />
          : <CardGrid cards={cards} />}
      </section>

      <footer className="public-platform-footer">
        <p><Icon name="lock" size={17} /><strong>公开边界</strong></p>
        <span>本区域不提供上传、在线生成、审核、发布、学生数据或完整资源包下载。</span>
        <small>DGBook · 5G网络优化（高级）数字教材</small>
      </footer>
    </main>
  );
}

function StageFlow({ cards }: { cards: PublicPlatformCard[] }) {
  return (
    <ol className="public-platform-flow">
      {cards.map((card, index) => (
        <li className={`is-${card.kind}`} key={card.id}>
          <span className="public-platform-step">{String(index + 1).padStart(2, '0')}</span>
          <Icon name={iconFor(card.kind)} size={25} />
          <strong>{card.title}</strong>
          <p>{card.summary}</p>
          <Status status={card.status} />
        </li>
      ))}
    </ol>
  );
}

function CardGrid({ cards }: { cards: PublicPlatformCard[] }) {
  return (
    <div className="public-platform-grid">
      {cards.map((card) => (
        <article className={`public-platform-card is-${card.kind}`} key={card.id}>
          {card.thumbnailUrl
            ? <div className="public-platform-thumbnail"><img alt="" loading="lazy" src={card.thumbnailUrl} /></div>
            : <div className="public-platform-card-icon"><Icon name={iconFor(card.kind)} size={28} /></div>}
          <div className="public-platform-card-copy">
            <span>{kindLabel(card.kind)}</span>
            <h2>{card.title}</h2>
            <p>{card.summary}</p>
          </div>
          <footer>
            <Status status={card.status} />
            {card.outputMode ? <small>{card.outputMode === 'resource-package' ? '资源包摘要' : '教材直接挂接'}</small> : null}
          </footer>
        </article>
      ))}
    </div>
  );
}

function Status({ status }: { status: PublicPlatformCard['status'] }) {
  const labels: Record<PublicPlatformCard['status'], string> = {
    ready: '已就绪',
    review: '复核中',
    sample: '样例',
  };
  return <span className={`public-platform-status is-${status}`}>{labels[status]}</span>;
}

function iconFor(kind: PublicPlatformCard['kind']): IconName {
  return { source: 'file', resource: 'layers', gate: 'check', delivery: 'book' }[kind] as IconName;
}

function kindLabel(kind: PublicPlatformCard['kind']): string {
  return { source: '输入材料', resource: '教材资源', gate: '质量门禁', delivery: '交付结果' }[kind];
}
