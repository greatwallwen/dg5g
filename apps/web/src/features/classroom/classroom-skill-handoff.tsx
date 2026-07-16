import Link from 'next/link';
import { Icon } from '@/ui/foundation/icons';

export function ClassroomSkillHandoff({ nodeId }: { nodeId: string }) {
  return (
    <section className="follow-skill-handoff" data-follow-skill-handoff={nodeId}>
      <div><span>课堂学习证据已回流</span><strong>继续完成节点正文与任务挑战</strong></div>
      <Link href={`/learn/${nodeId}`}>继续学习 <Icon name="arrow" size={17} /></Link>
    </section>
  );
}
