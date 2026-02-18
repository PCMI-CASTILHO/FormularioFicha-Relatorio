// ======== MÓDULO DE PROCESSAMENTO DE PDFs - VERSÃO 3 (OFFLINE-FIRST) ========
// Solução robusta para processar PDFs mesmo após sincronização em background
// Compatível com iOS e cenários offline → online

// ======== CONFIGURAÇÕES SUPABASE ========
const SUPABASE_CONFIG = {
    url: 'https://sqiqmpgzjxjjztuzlewg.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxaXFtcGd6anhqanp0dXpsZXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDEzMzIsImV4cCI6MjA4NTE3NzMzMn0.o-IKqiSvBdUZoKiWHi2TzIBuXPG1jcL2JdUwedNM4y8',
    bucket: 'pdfs-temporarios'
};

// ======== CONFIGURAÇÕES WHATSAPP ========
const WHATSAPP_CONFIG = {
    apiUrl: 'https://api.leadfinder.com.br/integracao/enviarMensagem/6B2991B488/ARQUIVO',
    token: '58103127083906988C16EAD628F241E78C350689710608F82A91D2D3C4D36757',
    groupId: '120363021586402490-group'
};

// ======== VARIÁVEIS DE CONTROLE ========
let monitorandoDB = false;
let intervalMonitor = null;
let processandoAtualmente = false;

// ======== INICIALIZAÇÃO AUTOMÁTICA ========
window.addEventListener('load', async () => {
    console.log('🔍 PDF Processor V3: Iniciando...');
    
    // Verificação imediata ao carregar
    await verificarPendenciasPDFs();
    
    // Inicia monitoramento contínuo
    iniciarMonitoramentoContinuo();
});

// ======== EVENTO DE VISIBILIDADE (detecta quando usuário volta à página) ========
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
        console.log('👁️ Página ficou visível - verificando pendências...');
        await verificarPendenciasPDFs();
    }
});

// ======== EVENTO DE FOCO (detecta quando janela recebe foco) ========
window.addEventListener('focus', async () => {
    console.log('🎯 Janela recebeu foco - verificando pendências...');
    await verificarPendenciasPDFs();
});

// ======== EVENTO DE ONLINE (detecta quando dispositivo volta online) ========
window.addEventListener('online', async () => {
    console.log('🌐 Dispositivo voltou online - verificando pendências...');
    // Aguarda 2 segundos para dar tempo do background sync concluir
    setTimeout(async () => {
        await verificarPendenciasPDFs();
    }, 2000);
});

// ======== MONITORAMENTO CONTÍNUO DO INDEXEDDB ========
function iniciarMonitoramentoContinuo() {
    if (monitorandoDB) return;
    
    monitorandoDB = true;
    console.log('👁️ Monitoramento contínuo ativado (verifica a cada 5 segundos)');
    
    // Verifica a cada 5 segundos
    intervalMonitor = setInterval(async () => {
        await verificarPendenciasPDFs();
    }, 5000);
}

// ======== PARAR MONITORAMENTO ========
window.pararMonitoramentoPDFs = function() {
    if (intervalMonitor) {
        clearInterval(intervalMonitor);
        monitorandoDB = false;
        console.log('⏹️ Monitoramento pausado');
    }
};

// ======== VERIFICAR FORMULÁRIOS SINCRONIZADOS SEM PDFs ========
async function verificarPendenciasPDFs() {
    // Evita verificações simultâneas
    if (processandoAtualmente) {
        console.log('⏳ Já está processando, aguardando...');
        return;
    }

    try {
        const db = await idb.openDB('FormulariosDB', 4);
        const forms = await db.getAll('formularios');

        // Busca formulários que:
        // 1. Estão sincronizados (têm serverId)
        // 2. Ainda não tiveram PDFs enviados OU foram editados após o último envio
        // 3. Não estão sendo processados no momento
        const formsPendentes = forms.filter(f => 
            f.sincronizado && 
            f.serverId && 
            (
                !f.pdfsEnviados ||
                f.pdfsPrecisamAtualizar ||
                (f.pdfsEnviadosAt && f.updatedAt && new Date(f.updatedAt) > new Date(f.pdfsEnviadosAt))
            ) &&
            !f.processandoPDFs
        );

        if (formsPendentes.length > 0) {
            console.log(`📋 ${formsPendentes.length} formulário(s) com PDFs pendentes`);
            console.log('IDs pendentes:', formsPendentes.map(f => `${f.id} (serverId: ${f.serverId})`));
            
            processandoAtualmente = true;
            
            for (const form of formsPendentes) {
                await processarPDFsAutomatico(form);
            }
            
            processandoAtualmente = false;
        }

    } catch (err) {
        console.error('❌ Erro ao verificar pendências:', err);
        processandoAtualmente = false;
    }
}

// ======== PROCESSAR PDFs AUTOMATICAMENTE ========
async function processarPDFsAutomatico(formData) {
    const serverId = formData.serverId;
    
    console.log('📄 Processando PDFs para serverId:', serverId);

    // Marca como processando ANTES de começar
    try {
        const db = await idb.openDB('FormulariosDB', 4);
        const form = await db.get('formularios', formData.id);
        if (form) {
            form.processandoPDFs = true;
            form.tentativaProcessamento = (form.tentativaProcessamento || 0) + 1;
            form.ultimaTentativa = new Date().toISOString();
            await db.put('formularios', form);
            console.log(`🔒 Formulário ${formData.id} marcado como processando (tentativa ${form.tentativaProcessamento})`);
        }
    } catch (err) {
        console.error('❌ Erro ao marcar como processando:', err);
    }

    try {
        // Preparar dados completos
        const formDataCompleto = {
            cliente: formData.cliente || '',
            cidade: formData.cidade || '',
            equipamento: formData.equipamento || '',
            numeroSerie: formData.numeroSerie || '',
            tecnico: formData.tecnico || '',
            veiculo: formData.veiculo || '',
            estoque: formData.estoque || '',
            dataInicial: formData.dataInicial || '',
            horaInicial: formData.horaInicial || '',
            dataFinal: formData.dataFinal || '',
            horaFinal: formData.horaFinal || '',
            servico: formData.servico || '',
            relatorioMaquina: formData.relatorioMaquina || '',
            osComplementar: formData.osComplementar || '',
            osServico: formData.osServico || '',
            tecnicoNome: formData.tecnicoNome || formData.tecnico || '',
            clienteNome: formData.clienteNome || formData.cliente || ''
        };

        // 1. Gerar PDFs
        console.log('🎨 Gerando PDFs...');
        
        // Verifica se as funções de geração existem
        if (typeof gerarFichaPDFBase64 !== 'function' || typeof gerarRelatorioPDFBase64 !== 'function') {
            console.error('❌ Funções de geração de PDF não encontradas!');
            throw new Error('Funções de geração de PDF não disponíveis');
        }
        
        const pdfFichaBlob = await gerarFichaPDFBase64(
            formDataCompleto,
            formData.materiais || [],
            formData.fotos || [],
            formData.assinaturas || {},
            serverId
        );

        const pdfRelatorioBlob = await gerarRelatorioPDFBase64(
            formDataCompleto,
            formData.materiais || [],
            formData.fotos || [],
            formData.assinaturas || {},
            serverId
        );

        if (!pdfFichaBlob || !pdfRelatorioBlob) {
            throw new Error('Erro ao gerar PDFs - blobs vazios');
        }

        console.log('✅ PDFs gerados com sucesso');

        // 2. Sempre atualizar os arquivos no Supabase para evitar reenvio de PDF antigo
        const arquivoMateriais = `materiais_${serverId}.pdf`;
        const arquivoRelatorio = `relatorio_${serverId}.pdf`;
        
        console.log('🔄 Atualizando PDFs no Supabase...');
        const [urlMateriais, urlRelatorio] = await Promise.all([
            uploadParaSupabase(pdfFichaBlob, arquivoMateriais),
            uploadParaSupabase(pdfRelatorioBlob, arquivoRelatorio)
        ]);
        
        console.log('✅ PDFs disponíveis:', { urlMateriais, urlRelatorio });

        // 4. Enviar para WhatsApp
        console.log('📱 Enviando para WhatsApp...');
        await enviarParaWhatsApp(urlMateriais, `Ficha de Materiais (Nº ${serverId})`);
        await enviarParaWhatsApp(urlRelatorio, `Relatório de Serviço (Nº ${serverId})`);

        console.log('✅ Enviado para WhatsApp com sucesso!');

        // 5. Marcar como PDFs enviados no IndexedDB
        const db = await idb.openDB('FormulariosDB', 4);
        const form = await db.get('formularios', formData.id);
        if (form) {
            form.pdfsEnviados = true;
            form.pdfsEnviadosAt = new Date().toISOString();
            form.pdfsPrecisamAtualizar = false;
            form.processandoPDFs = false;
            await db.put('formularios', form);
            console.log('✅ Marcado como PDFs enviados no DB');
        }

        // 6. Agendar exclusão dos PDFs (10 minutos)
        setTimeout(async () => {
            await deletarDoSupabase(arquivoMateriais);
            await deletarDoSupabase(arquivoRelatorio);
            console.log('🗑️ PDFs temporários excluídos');
        }, 10 * 60 * 1000);

        // 7. Mostrar notificação de sucesso
        mostrarNotificacaoLocal(
            '✅ PDFs Enviados!',
            `Relatório do serviço #${serverId} enviado para WhatsApp`
        );

    } catch (err) {
        console.error('❌ Erro ao processar PDFs:', err);
        console.error('Stack:', err.stack);
        
        // Remove flag de processamento em caso de erro
        try {
            const db = await idb.openDB('FormulariosDB', 4);
            const form = await db.get('formularios', formData.id);
            if (form) {
                form.processandoPDFs = false;
                form.erroProcessamento = err.message;
                form.erroProcessamentoAt = new Date().toISOString();
                await db.put('formularios', form);
            }
        } catch (dbErr) {
            console.error('❌ Erro ao limpar flag de processamento:', dbErr);
        }
        
        mostrarNotificacaoLocal(
            '❌ Erro ao Enviar PDFs',
            `Erro: ${err.message}. Tentaremos novamente.`
        );
    }
}

// ======== UPLOAD PARA SUPABASE ========
async function uploadParaSupabase(blob, filename) {
    try {
        // Remove versão anterior para garantir que o arquivo seja sempre atualizado
        await deletarDoSupabase(filename);
        
        const formData = new FormData();
        formData.append('file', blob, filename);

        const encodedFilename = encodeURIComponent(filename);
        const response = await fetch(
            `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.bucket}/${encodedFilename}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
                },
                body: formData
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Upload falhou (${response.status}): ${error}`);
        }

        const publicUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/public/${SUPABASE_CONFIG.bucket}/${encodedFilename}`;
        console.log(`✅ Arquivo ${filename} enviado para Supabase`);
        return publicUrl;

    } catch (err) {
        console.error('❌ Erro no upload para Supabase:', err);
        throw err;
    }
}

// ======== ENVIAR PARA WHATSAPP ========
async function enviarParaWhatsApp(urlArquivo, mensagem) {
    try {
        const payload = {
            mensagem: mensagem,
            arquivo: urlArquivo,
            destinatarios: [WHATSAPP_CONFIG.groupId]
        };

        const response = await fetch(WHATSAPP_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': WHATSAPP_CONFIG.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`WhatsApp falhou (${response.status}): ${error}`);
        }

        console.log(`✅ "${mensagem}" enviado para WhatsApp`);

    } catch (err) {
        console.error('❌ Erro ao enviar para WhatsApp:', err);
        throw err;
    }
}

// ======== DELETAR DO SUPABASE ========
async function deletarDoSupabase(filename) {
    try {
        const response = await fetch(
            `${SUPABASE_CONFIG.url}/storage/v1/object/${SUPABASE_CONFIG.bucket}/${filename}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
                }
            }
        );

        if (response.ok) {
            console.log(`🗑️ Arquivo ${filename} deletado do Supabase`);
        }

    } catch (err) {
        console.error('❌ Erro ao deletar do Supabase:', err);
    }
}

// ======== MOSTRAR NOTIFICAÇÃO LOCAL ========
function mostrarNotificacaoLocal(titulo, mensagem) {
    // Tenta mostrar notificação do navegador
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(titulo, {
                body: mensagem,
                icon: '/icon-192.png',
                badge: '/badge-72.png'
            });
        } catch (err) {
            console.log(`ℹ️ Notificação não exibida: ${err.message}`);
        }
    }
    
    // Sempre loga no console também
    console.log(`🔔 ${titulo}: ${mensagem}`);
}

// ======== FUNÇÃO DE DEBUG ========
window.debugPendenciasPDFs = async function() {
    const db = await idb.openDB('FormulariosDB', 4);
    const forms = await db.getAll('formularios');
    
    const pendentes = forms.filter(f => 
        f.sincronizado && f.serverId && !f.pdfsEnviados
    );
    
    console.log('=== DEBUG PENDÊNCIAS ===');
    console.log('Total de formulários:', forms.length);
    console.log('Sincronizados:', forms.filter(f => f.sincronizado).length);
    console.log('Com serverId:', forms.filter(f => f.serverId).length);
    console.log('PDFs enviados:', forms.filter(f => f.pdfsEnviados).length);
    console.log('PENDENTES:', pendentes.length);
    
    pendentes.forEach(f => {
        console.log(`- ID: ${f.id}, serverId: ${f.serverId}, processando: ${f.processandoPDFs}, tentativas: ${f.tentativaProcessamento || 0}`);
    });
    
    return pendentes;
};

console.log('✅ PDF Processor V3 carregado (offline-first + multi-trigger)');
console.log('💡 Para debug, use: debugPendenciasPDFs()');
