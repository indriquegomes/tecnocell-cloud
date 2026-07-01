import { ConviteClient } from './ConviteClient'

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ConviteClient token={token} />
}
