import type { Metadata } from 'next';
import { buildPublicPlatformModel } from '@/features/platform-overview/public-platform-model';
import { PublicPlatformView } from '@/features/platform-overview/public-platform-view';

export const metadata: Metadata = { title: '平台总览 · DGBook' };

export default function PlatformPage() {
  return <PublicPlatformView model={buildPublicPlatformModel()} section="platform" />;
}
