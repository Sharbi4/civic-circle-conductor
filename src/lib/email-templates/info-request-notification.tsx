import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { organization?: string; email?: string; phone?: string; message?: string }

const Email = ({ organization, email, phone, message }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New info request from {organization || 'a visitor'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New information request</Heading>
        <Text style={muted}>Someone asked to learn more about Civi Meet.</Text>
        <Section style={box}>
          <Text style={row}><b>Organization:</b> {organization || 'none'}</Text>
          <Text style={row}><b>Email:</b> {email || 'none'}</Text>
          <Text style={row}><b>Phone:</b> {phone || 'none'}</Text>
          <Text style={row}><b>Message:</b> {message || 'none'}</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `New info request: ${d['organization'] || 'Civi Meet'}`,
  displayName: 'Info request (to support)',
  to: 'support@civimeet.com',
  previewData: { organization: 'Tucson Neighbors', email: 'jane@example.org', phone: '520-555-0100', message: 'We want to plan monthly meetups.' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', color: '#0b1d3a', margin: '0 0 8px' }
const muted = { color: '#55607a', fontSize: '14px' }
const box = { backgroundColor: '#f2f6ff', borderRadius: '10px', padding: '12px 18px' }
const row = { fontSize: '14px', color: '#0b1d3a', margin: '6px 0' }
