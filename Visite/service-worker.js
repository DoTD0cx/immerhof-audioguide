self.addEventListener('fetch', function (event){
    if(event.request.url.includes('https://dotd0cx.github.io/immerhof-audioguide/Visite')){
        event.respondWith(
            caches.match(event.request).then(function(response){
                return response || fetch(event.request).then(function(response){
                    return caches.open('NewCaches').then(function(cache){
                        cache.put(event.request,response.clone())
                        return response;
                    })
                })
            })
        )
    }
})