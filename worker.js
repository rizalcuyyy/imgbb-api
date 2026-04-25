addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  // ===== Upload endpoint =====
  if (path === "/upload" && request.method === "POST") {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!file) return new Response("No file uploaded", { status: 400 })

    const imgbbKey = IMGBB_API_KEY
    const payload = new FormData()
    payload.append("image", file)

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
      method: "POST",
      body: payload
    })
    const result = await res.json()
    if (!result.success) return new Response("Upload failed", { status: 500 })

    const imageId = crypto.randomUUID()
    const meta = {
      id: imageId,
      url: result.data.url,
      views: 0,
      created_at: Date.now()
    }

    await IMAGE_KV.put(imageId, JSON.stringify(meta))
    return new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } })
  }

  // ===== Serve image =====
  if (path.startsWith("/img/")) {
    const imageId = path.replace("/img/", "")
    const data = await IMAGE_KV.get(imageId, { type: "json" })
    if (!data) return new Response("Image not found", { status: 404 })

    event.waitUntil(updateView(imageId, data.views))

    return fetch(data.url, { cf: { cacheEverything: true, cacheTtl: 86400 } })
  }

  // ===== Galeri list =====
  if (path === "/gallery") {
    let images = []
    const list = await IMAGE_KV.list()
    for (const key of list.keys) {
      const meta = await IMAGE_KV.get(key.name, { type: "json" })
      if (meta) images.push(meta)
    }

    images.sort((a,b) => (b.views*2 + b.created_at) - (a.views*2 + a.created_at))
    return new Response(JSON.stringify(images), { headers: { "Content-Type": "application/json" } })
  }

  return new Response("Not Found", { status: 404 })
}

async function updateView(id, currentViews) {
  try {
    const data = await IMAGE_KV.get(id, { type: "json" })
    const newCount = currentViews + 1
    await IMAGE_KV.put(id, JSON.stringify({ ...data, views: newCount }))
  } catch(e) { console.error(e) }
}
