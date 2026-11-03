// S3 hand-off for serverless hosting (AWS Lambda), where a request or response body can't exceed
// 6 MB. Turned on by UPLOAD_BUCKET: the browser uploads the file straight to S3 with a short-lived
// signed URL, the server reads it from there, and the PDF goes back the same way. The bucket's
// lifecycle rule deletes anything left behind after a day; the server deletes inputs right away.
//
// Environment: UPLOAD_BUCKET, AWS_REGION (set by Lambda).

import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { HttpError } from './util.js'

export const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || ''
const URL_TTL_S = 300
// Keys the browser may hand back: inputs/<uuid> only, so a request can't name any other object.
const KEY = /^inputs\/[0-9a-f-]{36}$/

let client
const s3 = () => (client ??= new S3Client({}))

/** A signed PUT for one file of exactly `size` bytes (S3 rejects any other length). */
export async function uploadTarget(size, maxBytes) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, 'The file is empty.')
  if (size > maxBytes) throw new HttpError(413, `Files up to ${maxBytes / 1024 / 1024} MB can be converted.`)
  const key = `inputs/${randomUUID()}`
  const command = new PutObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key, ContentLength: size })
  return { key, url: await getSignedUrl(s3(), command, { expiresIn: URL_TTL_S }) }
}

/** Reads an uploaded file and deletes it. */
export async function takeUpload(key) {
  if (typeof key !== 'string' || !KEY.test(key)) throw new HttpError(400, 'Upload the file first.')
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key }))
    return Buffer.from(await res.Body.transformToByteArray())
  } catch (e) {
    if (e?.name === 'NoSuchKey') throw new HttpError(400, 'The upload expired or didn’t finish. Try again.')
    throw e
  } finally {
    s3()
      .send(new DeleteObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key }))
      .catch(() => {})
  }
}

/** Stores a finished PDF and returns a signed URL that downloads it. */
export async function publishResult(pdf) {
  const key = `results/${randomUUID()}.pdf`
  await s3().send(new PutObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key, Body: pdf, ContentType: 'application/pdf' }))
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key }), { expiresIn: URL_TTL_S })
}
