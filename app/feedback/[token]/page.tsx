import { Metadata } from 'next';
import FeedbackForm from './FeedbackForm';

export const metadata: Metadata = {
  title: 'Patient Feedback',
  description: 'Share your experience with us',
};

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FeedbackForm token={token} />;
}
