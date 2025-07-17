import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { parseCVFromBase64, parseCVFromText } from '@/lib/ai'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const textInput = formData.get('text') as string | null

    let cvText = ''

    if (file) {
      const fileType = file.type
      const arrayBuffer = await file.arrayBuffer()

      if (fileType === 'application/pdf') {
        // Use Claude's document API for PDFs
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        const parsed = await parseCVFromBase64(base64, session.user.id)
        cvText = [
          parsed.fullName,
          parsed.email,
          parsed.phone,
          parsed.location,
          parsed.summary,
          'SKILLS: ' + parsed.skills.join(', '),
          'EXPERIENCE:',
          ...parsed.experience.map(
            (e) =>
              `${e.title} at ${e.company} (${e.startDate}–${e.endDate ?? 'Present'}): ${e.description}`
          ),
          'EDUCATION:',
          ...parsed.education.map(
            (e) => `${e.degree} in ${e.field} at ${e.institution} (${e.endDate})`
          ),
        ]
          .filter(Boolean)
          .join('\n')

        // Store parsed data in profile
        await prisma.userProfile.upsert({
          where: { userId: session.user.id },
          create: {
            userId: session.user.id,
            cvText,
            skills: parsed.skills,
            bio: parsed.summary ?? undefined,
          },
          update: {
            cvText,
            skills: parsed.skills,
            bio: parsed.summary ?? undefined,
          },
        })

        return NextResponse.json({ cvText, parsed })
      } else if (
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.endsWith('.docx')
      ) {
        // Use mammoth for DOCX
        const { default: mammoth } = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
        cvText = result.value

        const parsed = await parseCVFromText(cvText, session.user.id)

        await prisma.userProfile.upsert({
          where: { userId: session.user.id },
          create: {
            userId: session.user.id,
            cvText,
            skills: parsed.skills,
            bio: parsed.summary ?? undefined,
          },
          update: {
            cvText,
            skills: parsed.skills,
            bio: parsed.summary ?? undefined,
          },
        })

        return NextResponse.json({ cvText, parsed })
      } else {
        return NextResponse.json({ error: 'Unsupported file type. Use PDF or DOCX.' }, { status: 400 })
      }
    } else if (textInput) {
      cvText = textInput
      await prisma.userProfile.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, cvText },
        update: { cvText },
      })
      return NextResponse.json({ cvText })
    } else {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 })
    }
  } catch (err) {
    console.error('CV parse error:', err)
    const message = err instanceof Error ? err.message : 'Failed to parse CV'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
