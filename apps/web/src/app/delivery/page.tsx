import type { Metadata } from 'next';
import { buildPublicPlatformModel } from '@/features/platform-overview/public-platform-model';
import { PublicPlatformView } from '@/features/platform-overview/public-platform-view';

export const metadata: Metadata = { title: '交付方式 · DGBook' };

export default function DeliveryPage() {
  return <PublicPlatformView model={buildPublicPlatformModel()} section="delivery" />;
}
