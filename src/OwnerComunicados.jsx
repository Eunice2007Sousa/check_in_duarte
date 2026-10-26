// src/OwnerComunicados.jsx
// Área do Duarte: enviar uma mensagem a todos os atletas com notificações ativas.

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function OwnerComunicados({ ownerPin }) {
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [contagem, setContagem] = useState(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);

  const carregarContagem = async () => {
    const { data } = await supabase.rpc("fn_push_contagem", {
      p_owner_pin: ownerPin,
    });

    setContagem(data && data.length > 0 ? data[0] : null);
  };

  useEffect(() => {
    carregarContagem();
  }, [ownerPin]);

  const enviar = async () => {
    setMsg(null);

    if (!corpo.trim()) {
      return setMsg({ ok: false, text: "Escreve a mensagem." });
    }

    const n = contagem ? contagem.n_atletas : 0;

    if (n === 0) {
      return setMsg({
        ok: false,
        text: "Ainda nenhum atleta ativou as notificações.",
      });
    }

    if (!window.confirm(`Enviar esta mensagem a ${n} atleta(s)?`)) return;

    setSending(true);

    try {
      const { data, error } = await supabase.rpc("fn_push_enviar_comunicado", {
        p_owner_pin: ownerPin,
        p_titulo: titulo.trim(),
        p_corpo: corpo.trim(),
      });

      if (error) throw error;

      // Envia já, sem esperar pelo cron (que corre de 5 em 5 minutos).
      await supabase.functions.invoke("send-push", {
        body: { owner_pin: ownerPin },
      });

      setMsg({ ok: true, text: `Comunicado enviado a ${data} atleta(s).` });
      setTitulo("");
      setCorpo("");
    } catch (e) {
      setMsg({
        ok: false,
        text: "Não foi possível enviar. Verifica a ligação e tenta novamente.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 max-w-xl">
      <div className="font-display text-xl tracking-wide text-zinc-200">
        Enviar comunicado
      </div>

      <div className="text-xs text-zinc-500">
        A mensagem chega como notificação aos atletas que a ativaram
        {contagem
          ? ` (${contagem.n_atletas} atleta${
              contagem.n_atletas === 1 ? "" : "s"
            }, ${contagem.n_dispositivos} dispositivo${
              contagem.n_dispositivos === 1 ? "" : "s"
            })`
          : ""}
        .
      </div>

      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value.slice(0, 80))}
        placeholder="Título (opcional)"
        className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full focus:border-[#72E580] focus:outline-none"
      />

      <textarea
        value={corpo}
        onChange={(e) => setCorpo(e.target.value.slice(0, 300))}
        placeholder="Mensagem"
        rows={4}
        className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full resize-none focus:border-[#72E580] focus:outline-none"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-600">{corpo.length}/300</span>

        <button
          onClick={enviar}
          disabled={sending}
          className="flex items-center justify-center gap-2 bg-[#72E580] text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-[#60d46f] disabled:opacity-40"
        >
          <Send size={16} />
          {sending ? "A enviar…" : "Enviar"}
        </button>
      </div>

      {msg && (
        <div
          className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
