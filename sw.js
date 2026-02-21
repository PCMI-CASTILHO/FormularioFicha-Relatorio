// ======== SERVICE WORKER: GERENCIADOR DE CACHE E SINCRONIZAÇÃO BÁSICA ========
// Versão simplificada - apenas cache e sincronização de dados
// O index.html cuida da geração e envio de PDFs

// Bibliotecas externas
importScripts('https://cdn.jsdelivr.net/npm/idb@8/build/umd.js');

// Nomenclatura de cache versionada
const CACHE_NAME = 'formulario-cache-v0116';

// Assets críticos para instalação mínima
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './sw.js'
];

// ======== EVENTO DE INSTALAÇÃO ========
self.addEventListener('install', event => {
    console.log('🟢 SW: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .catch(err => console.warn('⚠️ Falha ao cachear assets essenciais:', err))
            .then(() => self.skipWaiting())
    );
});

// ======== EVENTO DE ATIVAÇÃO ========
self.addEventListener('activate', event => {
    console.log('🔵 SW: Ativando...');
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(
                names.map(name => {
                    if (name !== CACHE_NAME) {
                        console.log('🗑️ Removendo cache antigo:', name);
                        return caches.delete(name);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

// ======== INTERCEPTAÇÃO DE REQUISIÇÕES (FETCH) ========
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;

    if (url.hostname === 'vps.pesoexato.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    const isCDN =
        url.hostname.includes('cdnjs') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdn.tailwindcss.com');

    if (isCDN) {
        event.respondWith(
            caches.match(event.request).then(cached => cached || fetch(event.request))
        );
        return;
    }

    if (url.hostname === location.hostname) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request).then(cached => {
                        if (cached) return cached;
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
                })
        );
        return;
    }
});

// ======== BACKGROUND SYNC ========
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync-formularios') {
        console.log('🔄 Background Sync disparado!');
        event.waitUntil(sincronizarPendentes());
    }
});

// ======== ENGINE DE SINCRONIZAÇÃO - APENAS DADOS ========
async function sincronizarPendentes() {
    try {
        const db = await idb.openDB('FormulariosDB', 4);
        const forms = await db.getAll('formularios');

        const form = forms.find(f => !f.sincronizado);

        if (!form) {
            console.log('✅ Nenhum formulário pendente');
            return;
        }

        console.log(`🔄 Sincronizando formulário ${form.id}`);

        // ======== ENVIAR APENAS DADOS PARA O SERVIDOR ========
        const payload = {
            json_dados: {
                id: form.id,
                cliente: form.cliente,
                cidade: form.cidade,
                equipamento: form.equipamento,
                tecnico: form.tecnico,
                servico: form.servico,
                dataInicial: form.dataInicial,
                horaInicial: form.horaInicial,
                dataFinal: form.dataFinal,
                horaFinal: form.horaFinal,
                veiculo: form.veiculo,
                estoque: form.estoque,
                numeroSerie: form.numeroSerie,
                relatorioMaquina: form.relatorioMaquina,
                fotos: form.fotos,
                assinaturas: form.assinaturas,
                clienteNome: form.clienteNome,
                tecnicoNome: form.tecnicoNome,
                materiais: form.materiais,
                chaveUnica: form.chaveUnica
            },
            chave: form.chaveUnica
        };

        const response = await fetch('https://vps.pesoexato.com/servico_set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn(`⚠️ Falha ao sincronizar ${form.id}: HTTP ${response.status}`);
            return;
        }

        const data = await response.json();
        const serverId = data.insertId;

        console.log(`✅ Dados sincronizados (serverId: ${serverId})`);

        // ======== NOTIFICAR INDEX.HTML PARA PROCESSAR PDFs ========
        const clients = await self.clients.matchAll({ type: 'window' });
        
        if (clients.length > 0) {
            // Envia mensagem para o index.html processar os PDFs
            clients[0].postMessage({
                type: 'SINCRONIZACAO_CONCLUIDA',
                formId: form.id,
                serverId: serverId,
                formData: form
            });
            console.log('📤 Notificação enviada para index.html processar PDFs');
        } else {
            console.log('ℹ️ Nenhuma janela aberta - PDFs serão processados na próxima abertura');
        }

        // Marca como sincronizado
        form.sincronizado = true;
        form.syncedAt = new Date().toISOString();
        form.serverId = serverId;
        await db.put('formularios', form);

        console.log(`✅ Formulário ${form.id} marcado como sincronizado`);

    } catch (err) {
        console.error('❌ Erro ao sincronizar:', err);
    }
}
