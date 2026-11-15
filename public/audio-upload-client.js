// Browser-to-Blob: file goes directly to Vercel Blob (not through the 4.5 MB Vercel Function body limit).
// The admin cookie is checked by api/audio-upload.js before an upload token is issued.
export async function uploadAudioToBlob(bookId, file) {
  // This ESM CDN dependency is required only when an admin uploads audio.
  const { upload }=await import('https://esm.sh/@vercel/blob@2.9.0/client?bundle');
  const extension=file.name.toLowerCase().endsWith('.mp3')?'mp3':'wav';
  const safeName=`mocthu/audio/${bookId}/user-${Date.now()}.${extension}`;
  return upload(safeName,file,{
    access:'public', handleUploadUrl:'/api/audio-upload',
    clientPayload:JSON.stringify({bookId}),
    contentType:extension==='mp3'?'audio/mpeg':'audio/wav',
    multipart:file.size>100*1024*1024
  });
}
