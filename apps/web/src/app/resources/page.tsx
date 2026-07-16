import type { Metadata } from 'next';
import { buildPublicPlatformModel } from '@/features/platform-overview/public-platform-model';
import { PublicPlatformView } from '@/features/platform-overview/public-platform-view';

export const metadata: Metadata = { title: '资源目录 · DGBook' };

export default function ResourcesPage() {
  return <PublicPlatformView model={buildPublicPlatformModel()} section="resources" />;
}
