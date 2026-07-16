import type { Metadata } from 'next';
import { buildPublicPlatformModel } from '@/features/platform-overview/public-platform-model';
import { PublicPlatformView } from '@/features/platform-overview/public-platform-view';

export const metadata: Metadata = { title: '审核治理 · DGBook' };

export default function GovernancePage() {
  return <PublicPlatformView model={buildPublicPlatformModel()} section="governance" />;
}
