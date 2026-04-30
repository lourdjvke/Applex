import { readFileSync } from 'fs';
fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + process.env.GEMINI_API_KEY, {
    method: 'POST',
    headers: {
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Header-Content-Length': '10',
        'X-Goog-Upload-Header-Content-Type': 'text/plain',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: 'test.txt' } })
}).then(res => {
    const uploadUrl = res.headers.get('X-Goog-Upload-URL');
    console.log("URL:", uploadUrl);
    return fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Command': 'upload, finalize',
            'X-Goog-Upload-Offset': '0'
        },
        body: 'helloworld'
    });
}).then(res => res.text()).then(console.log);
