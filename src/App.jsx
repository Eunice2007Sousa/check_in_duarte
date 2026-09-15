import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient";
import {
  Dumbbell, Plus, Trash2, Users, CalendarDays, LayoutGrid, ChevronLeft, ChevronRight,
  ArrowLeft, KeyRound, CheckCircle2, XCircle, Ban, PackageCheck, Lock, Eye, EyeOff,
  Settings, Star, ClipboardList, AlertTriangle
} from "lucide-react";

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

// Segunda -> Domingo (alinhado com fn_inicio_semana no SQL,
// que também considera a semana Segunda -> Domingo).
const DIAS_ABBR = ["S", "T", "Q", "Q", "S", "S", "D"];

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

const CODE_LEN = 4;

// Antes controlava-se por "pack" (4/8/12 treinos).
// Agora controla-se por frequência semanal (1, 2 ou 3 treinos/semana).
const FREQUENCY_OPTIONS = [1, 2, 3];

/* ============================================================
   DATE / TIME
============================================================ */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function sameDay(a, b) {
  return isoDate(a) === isoDate(b);
}

function hhmm(hora) {
  return (hora || "").slice(0, 5);
}

// Aceita tanto "YYYY-MM-DD" (string vinda do Postgres) como Date.
function formatDiaMes(value) {
  if (!value) return "";

  const s = typeof value === "string" ? value : isoDate(value);
  const [, m, d] = s.split("-");

  return `${d}/${m}`;
}

function lisbonNow() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = {};

  fmt.formatToParts(new Date()).forEach((p) => {
    parts[p.type] = p.value;
  });

  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
}

function classDateTime(dateIso, hora) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);

  return new Date(y, m - 1, d, hh, mm);
}

/* ============================================================
   ERROR MESSAGES
============================================================ */

const ERROR_MESSAGES = {
  CREDENCIAIS_INVALIDAS: "ID ou PIN incorretos.",
  TURMA_INEXISTENTE: "Esta turma já não existe.",
  ATLETA_INEXISTENTE: "Este atleta já não existe.",
  AULA_JA_PASSOU: "Esta aula já aconteceu — não é possível marcar.",
  JA_INSCRITO: "Já estás inscrito nesta aula.",
  TURMA_CHEIA: "Esta aula já está com as vagas todas preenchidas.",
  MARCACAO_INEXISTENTE: "Não foi possível encontrar esta marcação.",
  CANCELAMENTO_TARDIO: "Já não é possível desmarcar: falta menos de 1h para a aula.",
  APENAS_MES_ATUAL: "Só podes marcar ou desmarcar aulas do mês atual.",
  LIMITE_SEMANAL_ATINGIDO: "Já atingiste o número de treinos permitidos esta semana.",
  FREQUENCIA_INVALIDA: "A frequência deve ser 1, 2 ou 3 treinos por semana.",
  PIN_INVALIDO: "PIN incorreto.",
  CODIGO_INVALIDO: "O código deve ter 4 dígitos.",
  CODIGO_JA_USADO: "Esse código já está a ser usado por outro atleta.",
  PIN_FORMATO_INVALIDO: "O novo PIN deve ter 4 dígitos.",
  CODIGOS_NAO_IGUAIS: "Os códigos não coincidem.",
  CODIGO_JA_DEFINIDO: "Este atleta já tem um código definido.",
};

function friendlyError(error) {
  if (!error) return "Ocorreu um erro inesperado.";

  const msg = error.message || String(error);

  const code = Object.keys(ERROR_MESSAGES).find((k) =>
    msg.includes(k)
  );

  return code
    ? ERROR_MESSAGES[code]
    : "Erro de ligação. Verifica a internet e tenta novamente.";
}

/* ============================================================
   APP
============================================================ */

export default function App() {
  const [role, setRole] = useState("atleta");
  const [ownerPin, setOwnerPin] = useState(null);

  const goToRole = (r) => {
    if (r === "atleta") {
      setOwnerPin(null);
    }

    setRole(r);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-body">

      <style>{`
        .font-display {
          font-family: 'Bebas Neue', sans-serif;
          letter-spacing: 0.03em;
        }

        .font-mono-id {
          font-family: 'Roboto Mono', monospace;
        }

        .font-body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>

      {!supabaseConfigured && (
        <div className="bg-amber-500/15 text-amber-400 text-xs text-center py-2 px-4 border-b border-amber-500/30">
          Faltam as variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
        </div>
      )}

      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-lime-400">
          <Dumbbell size={22} />
          <span className="font-display text-2xl tracking-wide">
            CHECK-IN
          </span>
        </div>

        <div className="flex gap-2">

          <button
            onClick={() => goToRole("dono")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm border transition-colors ${
              role === "dono"
                ? "border-lime-400 text-lime-400"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Lock size={14} />
            Área do Duarte
          </button>

          <button
            onClick={() => goToRole("atleta")}
            className={`px-4 py-2 rounded-md text-sm border transition-colors ${
              role === "atleta"
                ? "border-lime-400 text-lime-400"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Área do Atleta
          </button>

        </div>
      </header>

      {role === "dono" ? (

        ownerPin ? (
          <OwnerArea
            ownerPin={ownerPin}
            onPinChanged={setOwnerPin}
          />
        ) : (
          <PinGate
            label="Código de acesso do Duarte"
            verify={async (digits) => {
              const { data, error } = await supabase.rpc(
                "fn_verificar_owner",
                {
                  p_pin: digits
                }
              );

              if (error) throw error;

              return data === true ? digits : null;
            }}
            onSuccess={setOwnerPin}
          />
        )

      ) : (
        <AtletaArea />
      )}

    </div>
  );
}

/* ============================================================
   PIN KEYPAD
============================================================ */

function PinGate({
  verify,
  label,
  title,
  onSuccess,
  onBack
}) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const timer = useRef(null);

  useEffect(() => {
    if (digits.length === CODE_LEN) {

      clearTimeout(timer.current);

      timer.current = setTimeout(async () => {
        setChecking(true);

        try {
          const payload = await verify(digits);

          if (payload) {
            onSuccess(payload);
          } else {
            setError("PIN incorreto.");
            setDigits("");
          }

        } catch (e) {
          setError(friendlyError(e));
          setDigits("");

        } finally {
          setChecking(false);
        }

      }, 150);
    }

    return () => clearTimeout(timer.current);
  }, [digits, verify, onSuccess]);

  const press = (d) => {
    if (!checking && digits.length < CODE_LEN) {
      setError("");
      setDigits((p) => p + d);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center px-6 py-16 gap-6">

      {onBack && (
        <button
          onClick={onBack}
          className="self-start ml-2 -mb-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-lime-400"
        >
          <ArrowLeft size={14} />
          Voltar
        </button>
      )}

      {title && (
        <div className="font-display text-2xl tracking-wide text-zinc-100 text-center">
          {title}
        </div>
      )}

      <div className="flex items-center gap-2 text-zinc-500 text-sm text-center">
        <KeyRound size={16} />
        {label}
      </div>

      <div className="flex gap-3">
        {Array.from({ length: CODE_LEN }).map((_, i) => (
          <div
            key={i}
            className={`w-16 h-20 sm:w-20 sm:h-24 rounded-xl border-2 flex items-center justify-center font-mono-id text-4xl sm:text-5xl ${
              digits[i]
                ? "border-lime-400 text-lime-400"
                : "border-zinc-800 text-zinc-700"
            }`}
          >
            {digits[i] ? "•" : "–"}
          </div>
        ))}
      </div>

      {checking && (
        <div className="text-zinc-500 text-xs">
          A verificar…
        </div>
      )}

      {error && (
        <div className="text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">

        {[1,2,3,4,5,6,7,8,9].map((n) => (
          <button
            key={n}
            disabled={checking}
            onClick={() => press(String(n))}
            className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 text-2xl font-mono-id hover:border-lime-400/50 hover:text-lime-400 active:scale-95 disabled:opacity-40"
          >
            {n}
          </button>
        ))}

        <button
          disabled={checking}
          onClick={() => {
            setDigits("");
            setError("");
          }}
          className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-rose-400 disabled:opacity-40"
        >
          <Ban size={20} />
        </button>

        <button
          disabled={checking}
          onClick={() => press("0")}
          className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 text-2xl font-mono-id hover:border-lime-400/50 hover:text-lime-400 active:scale-95 disabled:opacity-40"
        >
          0
        </button>

        <div />

      </div>

    </main>
  );
}

/* ============================================================
   MONTH CALENDAR
============================================================ */

function buildMonthCells(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  // Date.getDay() devolve 0=Domingo..6=Sábado. Como a semana
  // aqui é Segunda -> Domingo (igual ao fn_inicio_semana do
  // SQL), convertemos para 0=Segunda..6=Domingo antes de
  // calcular quantas células vazias entram antes do dia 1.
  const jsFirstDay = new Date(year, month, 1).getDay();
  const firstWeekday = (jsFirstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month, -i),
      outside: true
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(year, month, d),
      outside: false
    });
  }

  let next = 1;

  while (cells.length < 42) {
    cells.push({
      date: new Date(year, month + 1, next++),
      outside: true
    });
  }

  return cells;
}

function MonthCalendar({
  selected,
  onSelect,
  renderMarker,
  minDate,
  maxDate,
  onMonthChange
}) {
  const [viewMonth, setViewMonth] = useState(
    new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  const today = startOfDay(lisbonNow());

  const cells = buildMonthCells(viewMonth);

  useEffect(() => {
    if (onMonthChange) {
      onMonthChange(viewMonth);
    }
  }, [
    viewMonth.getFullYear(),
    viewMonth.getMonth()
  ]);

  const inRange = (d) =>
    (!minDate || d >= minDate) &&
    (!maxDate || d <= maxDate);

  const monthOf = (d) =>
    new Date(d.getFullYear(), d.getMonth(), 1);

  const canGoPrev =
    !minDate ||
    monthOf(viewMonth) > monthOf(minDate);

  const canGoNext =
    !maxDate ||
    monthOf(viewMonth) < monthOf(maxDate);

  const goToday = () => {
    const t = startOfDay(lisbonNow());

    setViewMonth(
      new Date(t.getFullYear(), t.getMonth(), 1)
    );

    onSelect(t);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">

      <div className="flex items-center justify-between mb-4">

        <div className="font-display text-xl tracking-wide text-zinc-200">
          {MESES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </div>

        <div className="flex items-center gap-1">

          <button
            onClick={() =>
              canGoPrev &&
              setViewMonth(
                new Date(
                  viewMonth.getFullYear(),
                  viewMonth.getMonth() - 1,
                  1
                )
              )
            }
            disabled={!canGoPrev}
            className={`p-2 rounded-md border ${
              canGoPrev
                ? "border-zinc-800 text-zinc-400 hover:text-lime-400 hover:border-lime-400/40"
                : "border-zinc-900 text-zinc-800 cursor-not-allowed"
            }`}
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={goToday}
            className="px-3 py-2 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-lime-400"
          >
            Hoje
          </button>

          <button
            onClick={() =>
              canGoNext &&
              setViewMonth(
                new Date(
                  viewMonth.getFullYear(),
                  viewMonth.getMonth() + 1,
                  1
                )
              )
            }
            disabled={!canGoNext}
            className={`p-2 rounded-md border ${
              canGoNext
                ? "border-zinc-800 text-zinc-400 hover:text-lime-400 hover:border-lime-400/40"
                : "border-zinc-900 text-zinc-800 cursor-not-allowed"
            }`}
          >
            <ChevronRight size={16} />
          </button>

        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">

        {DIAS_ABBR.map((d, i) => (
          <div
            key={i}
            className="text-center text-xs text-zinc-600 font-medium py-1"
          >
            {d}
          </div>
        ))}

      </div>

      <div className="grid grid-cols-7 gap-1">

        {cells.map((c, i) => {

          const day = startOfDay(c.date);

          const isToday = sameDay(day, today);
          const isSelected = sameDay(day, selected);
          const disabled = !inRange(day);

          return (
            <button
              key={i}
              onClick={() =>
                !disabled && onSelect(day)
              }
              disabled={disabled}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-colors
                ${
                  disabled
                    ? "text-zinc-800 cursor-not-allowed"
                    : c.outside
                    ? "text-zinc-700"
                    : "text-zinc-300"
                }
                ${
                  isSelected && !disabled
                    ? "bg-lime-400 text-zinc-950 font-semibold"
                    : disabled
                    ? ""
                    : "hover:bg-zinc-800"
                }
                ${
                  isToday && !isSelected
                    ? "ring-1 ring-lime-400/60"
                    : ""
                }
              `}
            >
              <span>{c.date.getDate()}</span>

              {!isSelected &&
                !disabled &&
                renderMarker
                ? renderMarker(c.date)
                : null}

            </button>
          );
        })}

      </div>

    </div>
  );
}

/* ============================================================
   OWNER AREA
============================================================ */

function OwnerArea({ ownerPin, onPinChanged }) {
  const [tab, setTab] = useState("calendario");

  return (
    <main className="px-6 py-8 max-w-4xl w-full mx-auto">

      <div className="flex gap-2 mb-6 flex-wrap">

        <TabButton
          icon={CalendarDays}
          label="Calendário"
          active={tab === "calendario"}
          onClick={() => setTab("calendario")}
        />

        <TabButton
          icon={LayoutGrid}
          label="Turmas"
          active={tab === "turmas"}
          onClick={() => setTab("turmas")}
        />

        <TabButton
          icon={Users}
          label="Atletas"
          active={tab === "atletas"}
          onClick={() => setTab("atletas")}
        />

        <TabButton
          icon={Settings}
          label="Definições"
          active={tab === "definicoes"}
          onClick={() => setTab("definicoes")}
        />

        <TabButton
          icon={ClipboardList}
          label="Auditoria"
          active={tab === "auditoria"}
          onClick={() => setTab("auditoria")}
        />

      </div>

      {tab === "calendario" && (
        <OwnerCalendar ownerPin={ownerPin} />
      )}

      {tab === "turmas" && (
        <OwnerTurmas ownerPin={ownerPin} />
      )}

      {tab === "atletas" && (
        <OwnerAtletas ownerPin={ownerPin} />
      )}

      {tab === "definicoes" && (
        <OwnerSettings
          ownerPin={ownerPin}
          onPinChanged={onPinChanged}
        />
      )}

      {tab === "auditoria" && (
        <OwnerAuditLog ownerPin={ownerPin} />
      )}

    </main>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm border ${
        active
          ? "border-lime-400 text-lime-400"
          : "border-zinc-800 text-zinc-500"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

/* ============================================================
   OWNER CALENDAR
============================================================ */

function OwnerCalendar({ ownerPin }) {
  const [date, setDate] = useState(
    startOfDay(lisbonNow())
  );

  const [turmas, setTurmas] = useState([]);
  const [resumoMes, setResumoMes] = useState([]);
  const [inscritosPorTurma, setInscritosPorTurma] = useState({});
  const [loading, setLoading] = useState(false);

  const iso = isoDate(date);

  useEffect(() => {
    supabase
      .rpc("fn_listar_turmas")
      .then(({ data }) => {
        setTurmas(data || []);
      });
  }, []);

  const handleMonthChange = useCallback(
    async (viewMonth) => {

      const desde = isoDate(
        new Date(
          viewMonth.getFullYear(),
          viewMonth.getMonth(),
          1
        )
      );

      const ate = isoDate(
        new Date(
          viewMonth.getFullYear(),
          viewMonth.getMonth() + 1,
          0
        )
      );

      const { data } = await supabase.rpc(
        "fn_resumo_periodo",
        {
          p_owner_pin: ownerPin,
          p_desde: desde,
          p_ate: ate
        }
      );

      setResumoMes(data || []);
    },
    [ownerPin]
  );

  const templatesHoje = turmas
    .filter(
      (t) => t.dia_semana === date.getDay()
    )
    .sort(
      (a, b) =>
        a.hora.localeCompare(b.hora)
    );

  useEffect(() => {

    let cancelled = false;

    if (templatesHoje.length === 0) {
      setInscritosPorTurma({});
      return;
    }

    (async () => {

      setLoading(true);

      const results = await Promise.all(
        templatesHoje.map((t) =>
          supabase.rpc(
            "fn_ver_inscritos",
            {
              p_owner_pin: ownerPin,
              p_turma_id: t.id,
              p_data: iso
            }
          )
        )
      );

      if (cancelled) return;

      const map = {};

      templatesHoje.forEach((t, i) => {
        map[t.id] =
          results[i].data || [];
      });

      setInscritosPorTurma(map);
      setLoading(false);

    })();

    return () => {
      cancelled = true;
    };

  }, [
    iso,
    turmas.length,
    ownerPin
  ]);

  const marker = (d) => {

    const dIso = isoDate(d);

    const rows =
      resumoMes.filter(
        (r) => r.data === dIso
      );

    if (rows.length === 0) {
      return null;
    }

    const alguma = rows.some(
      (r) => r.ocupadas > 0
    );

    return (
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          alguma
            ? "bg-lime-400"
            : "bg-zinc-600"
        }`}
      />
    );
  };

  return (
    <div className="grid md:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">

      <MonthCalendar
        selected={date}
        onSelect={setDate}
        renderMarker={marker}
        onMonthChange={handleMonthChange}
      />

      <div className="space-y-3">

        <div className="text-sm text-zinc-500">
          {DIAS[date.getDay()]}, {date.getDate()} de{" "}
          {MESES[date.getMonth()]}
        </div>

        {templatesHoje.length === 0 && (
          <div className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            Não há turmas agendadas para{" "}
            {DIAS[date.getDay()]}s.
          </div>
        )}

        {templatesHoje.map((t) => {

          const inscritos =
            inscritosPorTurma[t.id] || [];

          const cheio =
            inscritos.length >= t.capacidade;

          return (
            <div
              key={t.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
            >

              <div className="flex items-center justify-between mb-2">

                <span className="font-mono-id text-lime-400 text-lg">
                  {hhmm(t.hora)}
                </span>

                <span
                  className={`text-xs font-medium px-2 py-1 rounded-md ${
                    cheio
                      ? "bg-rose-500/15 text-rose-400"
                      : "bg-emerald-500/15 text-emerald-400"
                  }`}
                >
                  {inscritos.length}/
                  {t.capacidade} vagas ocupadas
                </span>

              </div>

              {loading ? (
                <div className="text-zinc-600 text-sm">
                  A carregar…
                </div>
              ) : inscritos.length === 0 ? (
                <div className="text-zinc-600 text-sm">
                  Sem atletas inscritos.
                </div>
              ) : (
                <ul className="text-sm text-zinc-300 space-y-1">
                  {inscritos.map((a, i) => (
                    <li key={i}>
                      • {a.nome} - {a.numero_id}
                    </li>
                  ))}
                </ul>
              )}

            </div>
          );
        })}

      </div>
    </div>
  );
}

/* ============================================================
   OWNER TURMAS
============================================================ */

function OwnerTurmas({ ownerPin }) {

  const [turmas, setTurmas] = useState([]);
  const [dia, setDia] = useState(1);
  const [hora, setHora] = useState("18:00");
  const [error, setError] = useState("");

  const carregar = useCallback(() => {

    supabase
      .rpc("fn_listar_turmas")
      .then(({ data }) => {
        setTurmas(data || []);
      });

  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const addTemplate = async () => {

    setError("");

    const { error } =
      await supabase.rpc(
        "fn_criar_turma",
        {
          p_owner_pin: ownerPin,
          p_dia_semana: Number(dia),
          p_hora: hora
        }
      );

    if (error) {
      return setError(
        friendlyError(error)
      );
    }

    carregar();
  };

  const removeTemplate = async (id) => {

    const { error } =
      await supabase.rpc(
        "fn_remover_turma",
        {
          p_owner_pin: ownerPin,
          p_turma_id: id
        }
      );

    if (error) {
      return setError(
        friendlyError(error)
      );
    }

    carregar();
  };

  return (
    <div className="space-y-6">

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">

        <div className="font-display text-xl tracking-wide text-zinc-200">
          Criar turma semanal
        </div>

        <div className="text-xs text-zinc-500">
          Cada turma dura 1 hora e tem 5 vagas por defeito.
        </div>

        <div className="flex flex-col sm:flex-row gap-3">

          <select
            value={dia}
            onChange={(e) =>
              setDia(e.target.value)
            }
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full"
          >
            {DIAS.map((d, i) => (
              <option
                key={i}
                value={i}
              >
                {d}
              </option>
            ))}
          </select>

          <input
            type="time"
            value={hora}
            onChange={(e) =>
              setHora(e.target.value)
            }
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full sm:w-36 font-mono-id"
          />

          <button
            onClick={addTemplate}
            className="flex items-center justify-center gap-2 bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300 whitespace-nowrap"
          >
            <Plus size={16} />
            Criar turma
          </button>

        </div>

        {error && (
          <div className="text-rose-400 text-sm">
            {error}
          </div>
        )}

      </div>

      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">

        {turmas.length === 0 && (
          <div className="p-4 text-zinc-500 text-sm">
            Ainda não há turmas criadas.
          </div>
        )}

        {[...turmas]
          .sort(
            (a, b) =>
              a.dia_semana - b.dia_semana ||
              a.hora.localeCompare(b.hora)
          )
          .map((t) => (

            <div
              key={t.id}
              className="flex items-center justify-between px-4 py-3 bg-zinc-900"
            >

              <div className="flex items-center gap-3 text-sm">

                <span className="text-zinc-500 w-28">
                  {DIAS[t.dia_semana]}
                </span>

                <span className="font-mono-id text-lime-400">
                  {hhmm(t.hora)}
                </span>

                <span className="text-zinc-500 text-xs">
                  {t.capacidade} vagas
                </span>

              </div>

              <button
                onClick={() =>
                  removeTemplate(t.id)
                }
                className="text-zinc-600 hover:text-rose-400"
              >
                <Trash2 size={18} />
              </button>

            </div>

          ))}

      </div>

    </div>
  );
}

/* ============================================================
   OWNER ATLETAS
============================================================ */

function OwnerAtletas({ ownerPin }) {

  const [atletas, setAtletas] = useState([]);
  const [proximoId, setProximoId] = useState(null);

  const [newName, setNewName] = useState("");
  const [newFrequencia, setNewFrequencia] =
    useState(FREQUENCY_OPTIONS[0]);

  const [error, setError] = useState("");
  const [editingFreq, setEditingFreq] =
    useState(null);

  const [revealed, setRevealed] =
    useState({});

  const carregar = useCallback(
    async () => {

      const [
        { data: lista },
        { data: prox }
      ] = await Promise.all([
        supabase.rpc(
          "fn_listar_atletas",
          {
            p_owner_pin: ownerPin
          }
        ),
        supabase.rpc(
          "fn_proximo_numero_id"
        )
      ]);

      setAtletas(lista || []);
      setProximoId(prox ?? null);
    },
    [ownerPin]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const addAtleta = async () => {

    setError("");

    if (!newName.trim()) {
      return setError(
        "Indica o nome do atleta."
      );
    }

    const { error } =
      await supabase.rpc(
        "fn_criar_atleta",
        {
          p_owner_pin: ownerPin,
          p_nome: newName.trim(),
          p_frequencia: newFrequencia
        }
      );

    if (error) {
      return setError(
        friendlyError(error)
      );
    }

    setNewName("");
    carregar();
  };

  const removeAtleta = async (id) => {

    const { error } =
      await supabase.rpc(
        "fn_remover_atleta",
        {
          p_owner_pin: ownerPin,
          p_atleta_id: id
        }
      );

    if (error) {
      return setError(
        friendlyError(error)
      );
    }

    carregar();
  };

  // Substitui o antigo "assignPack": agora altera a
  // frequência semanal do atleta para o mês atual.
  const changeFrequencia = async (
    id,
    frequencia
  ) => {

    const { error } =
      await supabase.rpc(
        "fn_alterar_frequencia_atleta",
        {
          p_owner_pin: ownerPin,
          p_atleta_id: id,
          p_frequencia: frequencia
        }
      );

    if (error) {
      return setError(
        friendlyError(error)
      );
    }

    setEditingFreq(null);
    carregar();
  };

  return (
    <div className="space-y-6">

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">

        <div className="font-display text-xl tracking-wide text-zinc-200">
          Adicionar atleta
        </div>

        <div className="text-xs text-zinc-500">
          O ID é atribuído automaticamente
          {proximoId
            ? ` (o próximo será #${proximoId})`
            : ""}.
          O atleta irá escolher o seu próprio código
          de 4 dígitos na primeira utilização. A
          frequência escolhida abaixo aplica-se ao
          mês atual e será herdada automaticamente
          nos meses seguintes até seres tu a alterá-la.
        </div>

        <div className="flex flex-col sm:flex-row gap-3">

          <input
            value={newName}
            onChange={(e) =>
              setNewName(e.target.value)
            }
            placeholder="Nome do atleta"
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full"
          />

          <select
            value={newFrequencia}
            onChange={(e) =>
              setNewFrequencia(
                Number(e.target.value)
              )
            }
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full sm:w-48"
          >
            {FREQUENCY_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f} treino{f > 1 ? "s" : ""}/semana
              </option>
            ))}
          </select>

          <button
            onClick={addAtleta}
            className="flex items-center justify-center gap-2 bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300 whitespace-nowrap"
          >
            <Plus size={16} />
            Adicionar
          </button>

        </div>

        {error && (
          <div className="text-rose-400 text-sm">
            {error}
          </div>
        )}

      </div>

      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">

        {atletas.map((a) => (

            <div
              key={a.id}
              className="px-4 py-3 bg-zinc-900 flex items-center justify-between gap-4 flex-wrap"
            >

              <div>

                <div className="flex items-center gap-2">

                  <span className="text-zinc-200">
                    {a.nome}
                  </span>

                  <span className="font-mono-id text-zinc-500 text-xs">
                    #{a.numero_id}
                  </span>

                </div>

                <div className="text-xs text-zinc-500">
                  Frequência atual:{" "}
                  <span className="text-lime-400">
                    {a.frequencia_atual} treino
                    {a.frequencia_atual > 1 ? "s" : ""}/semana
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-2">

                  <span className="font-mono-id text-xs text-zinc-400 tracking-widest">
                    {a.codigo
                      ? revealed[a.id]
                        ? a.codigo
                        : "••••"
                      : "Ainda não definido"}
                  </span>

                  {a.codigo && (
                    <button
                      onClick={() =>
                        setRevealed((r) => ({
                          ...r,
                          [a.id]:
                            !r[a.id]
                        }))
                      }
                      className="text-zinc-600 hover:text-lime-400"
                    >
                      {revealed[a.id] ? (
                        <EyeOff size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </button>
                  )}

                </div>

              </div>

              <div className="flex items-center gap-2">

                {editingFreq === a.id ? (

                  <div className="flex items-center gap-2">

                    {FREQUENCY_OPTIONS.map((f) => (
                      <button
                        key={f}
                        onClick={() =>
                          changeFrequencia(a.id, f)
                        }
                        className="px-3 py-1.5 rounded-md border border-lime-400 text-lime-400 text-xs hover:bg-lime-400 hover:text-zinc-950"
                      >
                        {f}
                      </button>
                    ))}

                    <button
                      onClick={() =>
                        setEditingFreq(null)
                      }
                      className="text-zinc-500 text-xs px-2"
                    >
                      cancelar
                    </button>

                  </div>

                ) : (

                  <button
                    onClick={() =>
                      setEditingFreq(a.id)
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 text-xs hover:text-lime-400 hover:border-lime-400/40"
                  >
                    <PackageCheck size={14} />
                    Alterar frequência
                  </button>

                )}

                <button
                  onClick={() =>
                    removeAtleta(a.id)
                  }
                  className="text-zinc-600 hover:text-rose-400"
                >
                  <Trash2 size={18} />
                </button>

              </div>

            </div>
          ))}

      </div>

    </div>
  );
}

/* ============================================================
   OWNER SETTINGS
============================================================ */

function OwnerSettings({
  ownerPin,
  onPinChanged
}) {

  const [newPin, setNewPin] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const savePin = async () => {

    setError("");

    if (!/^\d{4}$/.test(newPin)) {
      return setError(
        "O novo PIN deve ter 4 dígitos."
      );
    }

    const { error } =
      await supabase.rpc(
        "fn_alterar_pin_dono",
        {
          p_pin_atual: ownerPin,
          p_novo_pin: newPin
        }
      );

    if (error) {
      return setError(
        friendlyError(error)
      );
    }

    onPinChanged(newPin);
    setNewPin("");
    setSaved(true);

    setTimeout(
      () => setSaved(false),
      2500
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 max-w-md">

      <div className="font-display text-xl tracking-wide text-zinc-200">
        Código de acesso do Duarte
      </div>

      <div className="text-xs text-zinc-500">
        Este é o código pedido sempre que se entra na Área do Duarte.
      </div>

      <div className="flex gap-3">

        <input
          value={newPin}
          onChange={(e) =>
            setNewPin(
              e.target.value
                .replace(/\D/g, "")
                .slice(0, CODE_LEN)
            )
          }
          placeholder="Novo código"
          className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full font-mono-id"
        />

        <button
          onClick={savePin}
          className="bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300"
        >
          Guardar
        </button>

      </div>

      {error && (
        <div className="text-rose-400 text-sm">
          {error}
        </div>
      )}

      {saved && (
        <div className="text-emerald-400 text-sm">
          Código atualizado.
        </div>
      )}

    </div>
  );
}

/* ============================================================
   AUDIT
============================================================ */

const ACTION_LABELS = {
  marcacao: {
    label: "Marcação",
    color: "bg-emerald-500/15 text-emerald-400"
  },

  desmarcacao: {
    label: "Desmarcação",
    color: "bg-zinc-700/40 text-zinc-300"
  },

  tentativa_bloqueada: {
    label: "Tentativa bloqueada",
    color: "bg-amber-500/15 text-amber-400"
  },

  alteracao_frequencia: {
    label: "Frequência alterada",
    color: "bg-sky-500/15 text-sky-400"
  }
};

function formatTimestamp(ts) {

  const d = new Date(ts);

  return `${isoDate(d)} às ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function OwnerAuditLog({ ownerPin }) {

  const [atletas, setAtletas] =
    useState([]);

  const [atletaId, setAtletaId] =
    useState("");

  const [entries, setEntries] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {

    supabase
      .rpc(
        "fn_listar_atletas",
        {
          p_owner_pin: ownerPin
        }
      )
      .then(({ data }) => {

        setAtletas(data || []);

        if (data && data.length > 0) {
          setAtletaId(data[0].id);
        }

      });

  }, [ownerPin]);

  useEffect(() => {

    if (!atletaId) return;

    setLoading(true);

    supabase
      .rpc(
        "fn_auditoria_atleta",
        {
          p_owner_pin: ownerPin,
          p_atleta_id: atletaId
        }
      )
      .then(({ data }) => {

        setEntries(data || []);
        setLoading(false);

      });

  }, [atletaId, ownerPin]);

  const atleta =
    atletas.find(
      (a) => a.id === atletaId
    );

  return (
    <div className="space-y-5">

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">

        <div className="font-display text-xl tracking-wide text-zinc-200">
          Registo de atividade
        </div>

        <div className="text-xs text-zinc-500">
          Mostra marcações, desmarcações, tentativas bloqueadas e alterações de frequência no último mês.
        </div>

        <select
          value={atletaId}
          onChange={(e) =>
            setAtletaId(e.target.value)
          }
          className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full sm:w-72"
        >

          {atletas.length === 0 && (
            <option value="">
              Sem atletas
            </option>
          )}

          {atletas.map((a) => (
            <option
              key={a.id}
              value={a.id}
            >
              {a.nome} (#{a.numero_id})
            </option>
          ))}

        </select>

      </div>

      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">

        {loading && (
          <div className="p-4 text-zinc-500 text-sm">
            A carregar…
          </div>
        )}

        {!loading &&
          entries.length === 0 && (
            <div className="p-4 text-zinc-500 text-sm">
              {atleta
                ? `Sem movimentos registados para ${atleta.nome} no último mês.`
                : "Seleciona um atleta."}
            </div>
          )}

        {!loading &&
          entries.map((e, i) => {

            const meta =
              ACTION_LABELS[e.action] || {
                label: e.action,
                color:
                  "bg-zinc-700/40 text-zinc-300"
              };

            return (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 flex-wrap"
              >

                <div className="flex items-center gap-3">

                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${meta.color}`}
                  >
                    {meta.label}
                  </span>

                  <span className="text-sm text-zinc-300">
                    {e.detalhe}
                  </span>

                </div>

                <span className="font-mono-id text-xs text-zinc-500">
                  {formatTimestamp(
                    e.criado_em
                  )}
                </span>

              </div>
            );
          })}

      </div>

    </div>
  );
}

/* ============================================================
   ÁREA DO ATLETA
============================================================ */

function AtletaArea() {

  const [candidate, setCandidate] =
    useState(null);

  const [session, setSession] =
    useState(null);

  if (!session) {

    if (!candidate) {
      return (
        <AtletaIdEntry
          onFound={setCandidate}
        />
      );
    }

    /*
  PRIMEIRA VEZ:
  o atleta ainda não tem código.
*/

if (!candidate.tem_codigo) {
  return (
    <AtletaFirstCode
      candidate={candidate}
      onSuccess={setSession}
      onBack={() =>
        setCandidate(null)
      }
    />
  );
}

    /*
      JÁ TEM CÓDIGO:
      login normal.
    */

    return (
      <PinGate
        title={`${candidate.nome} - ID ${candidate.numero_id}`}
        label="Insere o teu PIN para acesso à tua área"
        verify={async (digits) => {

          const {
            data,
            error
          } = await supabase.rpc(
            "fn_login_atleta",
            {
              p_numero_id:
                candidate.numero_id,
              p_codigo: digits
            }
          );

          if (error) throw error;

          if (!data || data.length === 0) {
            return null;
          }

          return {
            ...data[0],
            codigo: digits
          };
        }}
        onSuccess={setSession}
        onBack={() =>
          setCandidate(null)
        }
      />
    );
  }

  return (
    <AtletaDashboard
      session={session}
      onSessionUpdate={setSession}
      onSwitch={() => {
        setSession(null);
        setCandidate(null);
      }}
    />
  );
}

/* ============================================================
   ATLETA ID ENTRY
============================================================ */

function AtletaIdEntry({ onFound }) {

  const [digits, setDigits] =
    useState("");

  const [error, setError] =
    useState("");

  const [checking, setChecking] =
    useState(false);

  const MAX_ID_LEN = 6;

  const press = (d) => {

    if (
      !checking &&
      digits.length < MAX_ID_LEN
    ) {
      setError("");
      setDigits(
        (p) => p + d
      );
    }
  };

  const clearAll = () => {
    setDigits("");
    setError("");
  };

  const submit = async () => {

    if (!digits || checking) {
      return;
    }

    setChecking(true);
    setError("");

    try {

      const {
        data,
        error
      } = await supabase.rpc(
        "fn_buscar_nome_atleta",
        {
          p_numero_id:
            Number(digits)
        }
      );

      if (error) throw error;

      if (data && data.length > 0) {

        /*
          A função devolve numero_id, nome
          e codigo_definido.
        */

        onFound({
          ...data[0],
          tem_codigo:
            data[0].codigo_definido
        });

      } else {

        setError(
          "ID não reconhecido."
        );

        setDigits("");
      }

    } catch (e) {

      setError(
        friendlyError(e)
      );

    } finally {

      setChecking(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center px-6 py-16 gap-6">

      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <KeyRound size={16} />
        Introduz o teu ID de atleta
      </div>

      <div className="min-h-[4.5rem] sm:min-h-[5.5rem] flex items-end justify-center">

        <span className="font-mono-id text-5xl sm:text-6xl tracking-widest text-lime-400">

          {digits || (
            <span className="text-zinc-700">
              –
            </span>
          )}

        </span>

      </div>

      {checking && (
        <div className="text-zinc-500 text-xs">
          A verificar…
        </div>
      )}

      {error && (
        <div className="text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">

        {[1,2,3,4,5,6,7,8,9].map((n) => (
          <button
            key={n}
            disabled={checking}
            onClick={() =>
              press(String(n))
            }
            className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 text-2xl font-mono-id hover:border-lime-400/50 hover:text-lime-400 active:scale-95 disabled:opacity-40"
          >
            {n}
          </button>
        ))}

        <button
          disabled={checking}
          onClick={clearAll}
          className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-rose-400"
        >
          <Ban size={20} />
        </button>

        <button
          disabled={checking}
          onClick={() =>
            press("0")
          }
          className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 text-2xl font-mono-id hover:border-lime-400/50 hover:text-lime-400"
        >
          0
        </button>

        <button
          onClick={submit}
          disabled={!digits || checking}
          className={`aspect-square rounded-xl flex items-center justify-center font-medium ${
            digits && !checking
              ? "bg-lime-400 text-zinc-950 hover:bg-lime-300 active:scale-95"
              : "bg-zinc-900 border border-zinc-800 text-zinc-700 cursor-not-allowed"
          }`}
        >
          <CheckCircle2 size={22} />
        </button>

      </div>

    </main>
  );
}

/* ============================================================
   PRIMEIRA DEFINIÇÃO DO CÓDIGO
============================================================ */

function AtletaFirstCode({
  candidate,
  onSuccess,
  onBack
}) {

  const [step, setStep] =
    useState("create");

  const [digits, setDigits] =
    useState("");

  const [firstCode, setFirstCode] =
    useState("");

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const press = (d) => {

    if (
      saving ||
      digits.length >= CODE_LEN
    ) {
      return;
    }

    setError("");

    setDigits(
      (p) => p + d
    );
  };

  useEffect(() => {

    if (
      step === "create" &&
      digits.length === CODE_LEN
    ) {

      setFirstCode(digits);
      setDigits("");
      setStep("confirm");
    }

  }, [digits, step]);

  const confirmCode = async () => {

    if (digits.length !== CODE_LEN) {
      return;
    }

    if (digits !== firstCode) {

      setError(
        "Os códigos não coincidem."
      );

      setDigits("");
      return;
    }

    setSaving(true);
    setError("");

    try {

      const {
        data,
        error
      } = await supabase.rpc(
        "fn_definir_codigo_atleta",
        {
          p_numero_id:
            candidate.numero_id,
          p_novo_codigo: digits
        }
      );

      if (error) {
        throw error;
      }

      /*
        Depois de guardar o código,
        fazemos login automaticamente.
      */

      const {
        data: loginData,
        error: loginError
      } = await supabase.rpc(
        "fn_login_atleta",
        {
          p_numero_id:
            candidate.numero_id,
          p_codigo: digits
        }
      );

      if (loginError) {
        throw loginError;
      }

      if (
        !loginData ||
        loginData.length === 0
      ) {
        throw new Error(
          "CREDENCIAIS_INVALIDAS"
        );
      }

      onSuccess({
        ...loginData[0],
        codigo: digits
      });

    } catch (e) {

      setError(
        friendlyError(e)
      );

    } finally {

      setSaving(false);
    }
  };

  const clear = () => {

    if (saving) return;

    setDigits("");
    setError("");
  };

  const goBackStep = () => {

    if (saving) return;

    setError("");

    if (step === "confirm") {
      setFirstCode("");
      setDigits("");
      setStep("create");
    } else {
      onBack();
    }
  };

  return (
    <main className="flex flex-col items-center justify-center px-6 py-16 gap-6">

      <button
        onClick={goBackStep}
        className="self-start ml-2 -mb-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-lime-400"
      >
        <ArrowLeft size={14} />
        Voltar
      </button>

      <div className="text-center">

        <div className="font-display text-2xl tracking-wide text-zinc-100">
          {candidate.nome} — ID {candidate.numero_id}
        </div>

        <div className="text-sm text-zinc-500 mt-2 max-w-md">
          {step === "create"
            ? "É a tua primeira vez. Escolhe um código de 4 dígitos para passares a aceder à tua área."
            : "Repete o código de 4 dígitos para confirmar."}
        </div>

      </div>

      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <KeyRound size={16} />
        {step === "create"
          ? "Escolhe o teu código"
          : "Confirma o teu código"}
      </div>

      <div className="flex gap-3">

        {Array.from({
          length: CODE_LEN
        }).map((_, i) => (

          <div
            key={i}
            className={`w-16 h-20 sm:w-20 sm:h-24 rounded-xl border-2 flex items-center justify-center font-mono-id text-4xl sm:text-5xl ${
              digits[i]
                ? "border-lime-400 text-lime-400"
                : "border-zinc-800 text-zinc-700"
            }`}
          >
            {digits[i]
              ? "•"
              : "–"}
          </div>

        ))}

      </div>

      {saving && (
        <div className="text-zinc-500 text-xs">
          A guardar código…
        </div>
      )}

      {error && (
        <div className="text-rose-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">

        {[1,2,3,4,5,6,7,8,9].map((n) => (

          <button
            key={n}
            disabled={saving}
            onClick={() =>
              press(String(n))
            }
            className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 text-2xl font-mono-id hover:border-lime-400/50 hover:text-lime-400 active:scale-95 disabled:opacity-40"
          >
            {n}
          </button>

        ))}

        <button
          disabled={saving}
          onClick={clear}
          className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-rose-400"
        >
          <Ban size={20} />
        </button>

        <button
          disabled={saving}
          onClick={() =>
            press("0")
          }
          className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 text-2xl font-mono-id hover:border-lime-400/50 hover:text-lime-400"
        >
          0
        </button>

        <button
          onClick={confirmCode}
          disabled={
            digits.length !== CODE_LEN ||
            saving
          }
          className={`aspect-square rounded-xl flex items-center justify-center ${
            digits.length === CODE_LEN &&
            !saving
              ? "bg-lime-400 text-zinc-950 hover:bg-lime-300"
              : "bg-zinc-900 border border-zinc-800 text-zinc-700"
          }`}
        >
          <CheckCircle2 size={22} />
        </button>

      </div>

    </main>
  );
}

/* ============================================================
   ALTERAR CÓDIGO DO ATLETA
============================================================ */

function ChangeAthleteCode({
  session,
  onChanged,
  onCancel
}) {

  const [currentCode, setCurrentCode] =
    useState("");

  const [newCode, setNewCode] =
    useState("");

  const [confirmCode, setConfirmCode] =
    useState("");

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const save = async () => {

    setError("");

    if (!/^\d{4}$/.test(currentCode)) {
      return setError(
        "O código atual deve ter 4 dígitos."
      );
    }

    if (!/^\d{4}$/.test(newCode)) {
      return setError(
        "O novo código deve ter 4 dígitos."
      );
    }

    if (newCode !== confirmCode) {
      return setError(
        "Os novos códigos não coincidem."
      );
    }

    if (newCode === currentCode) {
      return setError(
        "O novo código deve ser diferente do atual."
      );
    }

    setSaving(true);

    try {

      // NOTA: o nome desta função tinha de corresponder
      // exatamente ao alias criado no SQL
      // ("fn_alterar_codigo_atleta_proprio"), caso
      // contrário a chamada falhava com "function not found".
      const {
  error
} = await supabase.rpc(
  "fn_alterar_codigo_atleta_proprio",
  {
    p_numero_id:
      session.numero_id,
    p_codigo_atual:
      currentCode,
    p_novo_codigo:
      newCode
  }
);
      if (error) {
        throw error;
      }

      /*
        Atualizamos o código da sessão
        para o novo código.
      */

      onChanged({
        ...session,
        codigo: newCode
      });

    } catch (e) {

      setError(
        friendlyError(e)
      );

    } finally {

      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">

      <div>

        <div className="font-display text-xl tracking-wide text-zinc-200">
          Alterar código
        </div>

        <div className="text-xs text-zinc-500 mt-1">
          O código é pessoal e será usado para entrar na tua área.
        </div>

      </div>

      <div className="space-y-3">

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={currentCode}
          onChange={(e) =>
            setCurrentCode(
              e.target.value
                .replace(/\D/g, "")
                .slice(0, 4)
            )
          }
          placeholder="Código atual"
          className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full font-mono-id"
        />

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={newCode}
          onChange={(e) =>
            setNewCode(
              e.target.value
                .replace(/\D/g, "")
                .slice(0, 4)
            )
          }
          placeholder="Novo código"
          className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full font-mono-id"
        />

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmCode}
          onChange={(e) =>
            setConfirmCode(
              e.target.value
                .replace(/\D/g, "")
                .slice(0, 4)
            )
          }
          placeholder="Repetir novo código"
          className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full font-mono-id"
        />

      </div>

      {error && (
        <div className="text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2">

        <button
          onClick={save}
          disabled={saving}
          className="bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300 disabled:opacity-40"
        >
          {saving
            ? "A guardar…"
            : "Alterar código"}
        </button>

        <button
          onClick={onCancel}
          disabled={saving}
          className="border border-zinc-800 text-zinc-400 rounded-md px-4 py-2 text-sm hover:text-zinc-200"
        >
          Cancelar
        </button>

      </div>

    </div>
  );
}

/* ============================================================
   DASHBOARD ATLETA
============================================================ */

function AtletaDashboard({
  session,
  onSessionUpdate,
  onSwitch
}) {

  const today =
    startOfDay(lisbonNow());

  // O atleta só pode marcar/desmarcar no mês atual,
  // por isso o calendário de marcação não avança
  // para além do último dia do mês corrente.
  const maxBookingDate =
    endOfMonth(today);

  const [date, setDate] =
    useState(today);

  const [turmas, setTurmas] =
    useState([]);

  const [minhasMarcacoes, setMinhasMarcacoes] =
    useState([]);

  const [historico, setHistorico] =
    useState([]);

  const [disponibilidadeMes, setDisponibilidadeMes] =
    useState([]);

  const [ocupacaoHoje, setOcupacaoHoje] =
    useState({});

  const [loadingDia, setLoadingDia] =
    useState(false);

  const [feedback, setFeedback] =
    useState(null);

  const [busy, setBusy] =
    useState(false);

  const [showChangeCode, setShowChangeCode] =
    useState(false);

  // Resumo da semana correspondente ao dia
  // selecionado no calendário de marcação — alimenta
  // o aviso junto às turmas do dia.
  const [resumoSemanaSelecionada, setResumoSemanaSelecionada] =
    useState(null);

  // Resumo da semana de HOJE — usado só para mostrar a
  // frequência do plano atual no cartão de perfil, de
  // forma constante (não muda com o dia selecionado).
  const [resumoSemanaAtual, setResumoSemanaAtual] =
    useState(null);

  const feedbackTimer =
    useRef(null);

  const iso = isoDate(date);

  const isPastDay =
    date < today;

  const isSameDayAsToday =
    sameDay(date, today);

  const notify = (
    status,
    text
  ) => {

    clearTimeout(
      feedbackTimer.current
    );

    setFeedback({
      status,
      text
    });

    feedbackTimer.current =
      setTimeout(
        () => setFeedback(null),
        4000
      );
  };

  const fetchResumoSemana = useCallback(
    async (targetDate) => {

      const { data } =
        await supabase.rpc(
          "fn_resumo_semana_atleta",
          {
            p_numero_id:
              session.numero_id,
            p_codigo:
              session.codigo,
            p_data:
              isoDate(targetDate)
          }
        );

      return data && data.length > 0
        ? data[0]
        : null;
    },
    [session.numero_id, session.codigo]
  );

  const carregarTudo =
    useCallback(async () => {

      const [
        { data: t },
        { data: minhas },
        { data: hist },
        { data: loginRow }
      ] = await Promise.all([

        supabase.rpc(
          "fn_listar_turmas"
        ),

        supabase.rpc(
          "fn_minhas_marcacoes",
          {
            p_numero_id:
              session.numero_id,
            p_codigo:
              session.codigo
          }
        ),

        supabase.rpc(
          "fn_historico_marcacoes",
          {
            p_numero_id:
              session.numero_id,
            p_codigo:
              session.codigo
          }
        ),

        supabase.rpc(
          "fn_login_atleta",
          {
            p_numero_id:
              session.numero_id,
            p_codigo:
              session.codigo
          }
        )
      ]);

      setTurmas(t || []);
      setMinhasMarcacoes(
        minhas || []
      );
      setHistorico(
        hist || []
      );

      if (
        loginRow &&
        loginRow.length > 0
      ) {
        onSessionUpdate(
          (prev) => ({
            ...prev,
            ...loginRow[0],
            codigo:
              session.codigo
          })
        );
      }

    }, [
      session.numero_id,
      session.codigo,
      onSessionUpdate
    ]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  // Frequência do plano atual — busca-se uma vez (com base em
  // "hoje") para alimentar o "Plano atual: X treinos/semana"
  // fixo no cartão de perfil.
  useEffect(() => {

    fetchResumoSemana(today).then(
      setResumoSemanaAtual
    );

  }, [fetchResumoSemana]);

  // Resumo da semana do dia selecionado no calendário.
  useEffect(() => {

    fetchResumoSemana(date).then(
      setResumoSemanaSelecionada
    );

  }, [iso, fetchResumoSemana]);

  const carregarOcupacaoDoDia =
    useCallback(
      async (
        targetDate,
        turmasList
      ) => {

        const dIso =
          isoDate(targetDate);

        const templatesDoDia =
          turmasList.filter(
            (t) =>
              t.dia_semana ===
              targetDate.getDay()
          );

        if (
          templatesDoDia.length === 0
        ) {
          setOcupacaoHoje({});
          return;
        }

        setLoadingDia(true);

        const results =
          await Promise.all(
            templatesDoDia.map((t) =>
              supabase.rpc(
                "fn_disponibilidade_turma",
                {
                  p_turma_id: t.id,
                  p_data: dIso
                }
              )
            )
          );

        const map = {};

        templatesDoDia.forEach(
          (t, i) => {
            map[t.id] =
              results[i].data === true;
          }
        );

        setOcupacaoHoje(map);
        setLoadingDia(false);
      },
      []
    );

  useEffect(() => {

    if (turmas.length > 0) {
      carregarOcupacaoDoDia(
        date,
        turmas
      );
    }

  }, [
    date,
    turmas,
    carregarOcupacaoDoDia
  ]);

  const handleMonthChange =
    useCallback(
      async (viewMonth) => {

        const desde =
          isoDate(
            new Date(
              viewMonth.getFullYear(),
              viewMonth.getMonth(),
              1
            )
          );

        const ate =
          isoDate(
            new Date(
              viewMonth.getFullYear(),
              viewMonth.getMonth() + 1,
              0
            )
          );

        const { data } =
          await supabase.rpc(
            "fn_disponibilidade_periodo",
            {
              p_desde: desde,
              p_ate: ate
            }
          );

        setDisponibilidadeMes(
          data || []
        );
      },
      []
    );

  const refreshResumos = async () => {

    const [atual, selecionada] =
      await Promise.all([
        fetchResumoSemana(today),
        fetchResumoSemana(date)
      ]);

    setResumoSemanaAtual(atual);
    setResumoSemanaSelecionada(selecionada);
  };

  const book = async (
    template
  ) => {

    if (busy) return;

    setBusy(true);

    const { error } =
      await supabase.rpc(
        "fn_marcar_aula",
        {
          p_numero_id:
            session.numero_id,
          p_codigo:
            session.codigo,
          p_turma_id:
            template.id,
          p_data:
            iso
        }
      );

    setBusy(false);

    if (error) {
      notify(
        "error",
        friendlyError(error)
      );
      return;
    }

    notify(
      "success",
      `Aula de ${hhmm(template.hora)} marcada com sucesso!`
    );

    await carregarTudo();
    await refreshResumos();

    await carregarOcupacaoDoDia(
      date,
      turmas
    );
  };

  const cancel = async (
    bookingId
  ) => {

    if (busy) return;

    setBusy(true);

    const {
      data,
      error
    } = await supabase.rpc(
      "fn_desmarcar_aula",
      {
        p_numero_id:
          session.numero_id,
        p_codigo:
          session.codigo,
        p_booking_id:
          bookingId
      }
    );

    setBusy(false);

    if (error) {

      notify(
        "error",
        friendlyError(error)
      );

      return;
    }

    const resultado =
      data && data[0];

    if (
      resultado &&
      resultado.sucesso === false
    ) {

      notify(
        "error",
        ERROR_MESSAGES[
          resultado.motivo
        ] ||
        resultado.motivo
      );

      return;
    }

    notify(
      "success",
      "Marcação cancelada."
    );

    await carregarTudo();
    await refreshResumos();

    await carregarOcupacaoDoDia(
      date,
      turmas
    );
  };

  const dismiss = async (
    bookingId
  ) => {

    if (busy) return;

    setBusy(true);

    const { error } =
      await supabase.rpc(
        "fn_dispensar_marcacao",
        {
          p_numero_id:
            session.numero_id,
          p_codigo:
            session.codigo,
          p_booking_id:
            bookingId
        }
      );

    setBusy(false);

    if (error) {

      notify(
        "error",
        friendlyError(error)
      );

      return;
    }

    carregarTudo();
  };

  const templatesHoje =
    turmas
      .filter(
        (t) =>
          t.dia_semana ===
          date.getDay()
      )
      .sort(
        (a, b) =>
          a.hora.localeCompare(
            b.hora
          )
      );

  const semanaSelecionadaCheia =
    !!resumoSemanaSelecionada &&
    resumoSemanaSelecionada.disponiveis <= 0;

  return (
    <main className="px-6 py-8 max-w-3xl w-full mx-auto space-y-6">

      {/* PERFIL */}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">

        <div>

          <div className="font-display text-2xl tracking-wide text-zinc-100">
            {session.nome}
          </div>

          {/* INFORMAÇÃO FIXA DO PLANO — o único elemento que
              fica no topo, sempre visível e sempre igual
              independentemente do dia selecionado no calendário. */}
          {resumoSemanaAtual && (
            <div className="text-sm text-zinc-500 mt-0.5">
              Plano atual:{" "}
              <span className="text-lime-400 font-medium">
                {resumoSemanaAtual.frequencia} treino
                {resumoSemanaAtual.frequencia > 1 ? "s" : ""} disponíve
                {resumoSemanaAtual.frequencia > 1 ? "is" : "l"} a realizar
                por semana
              </span>
            </div>
          )}

        </div>

        <div className="flex items-center gap-4">

          <button
            onClick={() =>
              setShowChangeCode(
                (v) => !v
              )
            }
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-lime-400"
          >
            <Settings size={16} />
            Código
          </button>

          <button
            onClick={onSwitch}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-lime-400"
          >
            <ArrowLeft size={16} />
            Sair
          </button>

        </div>

      </div>

      {showChangeCode && (
        <ChangeAthleteCode
          session={session}
          onChanged={(updated) => {

            onSessionUpdate(updated);
            setShowChangeCode(false);

            notify(
              "success",
              "Código alterado com sucesso."
            );
          }}
          onCancel={() =>
            setShowChangeCode(false)
          }
        />
      )}

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border flex items-center gap-2 ${
            feedback.status === "success"
              ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
              : "bg-rose-500/15 border-rose-500 text-rose-400"
          }`}
        >
          {feedback.status === "success"
            ? <CheckCircle2 size={16} />
            : <XCircle size={16} />}

          {feedback.text}
        </div>
      )}

      {/* MINHAS AULAS */}

      <div>

        <div className="font-display text-xl tracking-wide text-zinc-200 mb-3">
          As minhas aulas marcadas
        </div>

        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">

          {minhasMarcacoes.length === 0 && (
            <div className="p-4 text-zinc-500 text-sm">
              Ainda não tens aulas marcadas.
            </div>
          )}

          {minhasMarcacoes.map((b) => {

            const concluida =
              classDateTime(
                b.data,
                b.hora
              ) <= lisbonNow();

            return (
              <div
                key={b.booking_id}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 text-sm flex-wrap"
              >

                <span className="text-zinc-300">
                  {b.data} —{" "}
                  {DIAS[b.dia_semana]} às{" "}
                  <span className="font-mono-id text-lime-400">
                    {hhmm(b.hora)}
                  </span>
                </span>

                {concluida ? (

                  <div className="flex items-center gap-3">

                    <span className="text-xs font-medium px-2 py-1 rounded-md bg-sky-500/15 text-sky-400">
                      Aula concluída
                    </span>

                    <button
                      disabled={busy}
                      onClick={() =>
                        dismiss(
                          b.booking_id
                        )
                      }
                      className="text-xs text-zinc-500 hover:text-lime-400 underline"
                    >
                      Descartar
                    </button>

                  </div>

                ) : (

                  <button
                    onClick={() =>
                      cancel(
                        b.booking_id
                      )
                    }
                    className="text-zinc-600 hover:text-rose-400"
                  >
                    <Trash2 size={16} />
                  </button>

                )}

              </div>
            );
          })}

        </div>

      </div>

      {/* CALENDÁRIO */}

      <div>

        <div className="font-display text-xl tracking-wide text-zinc-200 mb-1">
          Marcar aula
        </div>

        <div className="text-xs text-zinc-500 mb-3">
          Só podes marcar e desmarcar aulas do mês atual
          (até {maxBookingDate.getDate()} de{" "}
          {MESES[maxBookingDate.getMonth()]}).
          Podes desmarcar até 1 hora antes da aula.
          Meses anteriores ficam disponíveis apenas para consulta.
        </div>

        <div className="grid md:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">

          <MonthCalendar
            selected={date}
            onSelect={setDate}
            maxDate={maxBookingDate}
            onMonthChange={
              handleMonthChange
            }
            renderMarker={(d) => {

              const dStart =
                startOfDay(d);

              const dIso =
                isoDate(d);

              // Todas as marcações (passadas ou futuras) do
              // atleta nesse dia. fn_historico_marcacoes devolve
              // TODAS as marcações existentes, não só as passadas.
              const marcacoesDoDia =
                historico.filter(
                  (h) =>
                    h.data === dIso
                );

              if (marcacoesDoDia.length > 0) {

                const todasRealizadas =
                  marcacoesDoDia.every(
                    (h) =>
                      classDateTime(
                        h.data,
                        h.hora
                      ) <= lisbonNow()
                  );

                if (todasRealizadas) {

                  // Aula(s) já realizada(s) neste dia.
                  return (
                    <Star
                      size={9}
                      className="text-yellow-400 fill-yellow-400"
                    />
                  );

                }

                // Há pelo menos uma aula marcada para este
                // dia que ainda não aconteceu.
                return (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                );

              }

              // Sem marcação neste dia: dias passados não
              // mostram nada; hoje/futuro mostram a
              // disponibilidade geral das turmas.
              if (dStart < today) {
                return null;
              }

              const rows =
                disponibilidadeMes.filter(
                  (r) =>
                    r.data === dIso
                );

              if (rows.length === 0) {
                return null;
              }

              const algumaComVaga =
                rows.some(
                  (r) =>
                    r.disponivel
                );

              return (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    algumaComVaga
                      ? "bg-emerald-400"
                      : "bg-rose-500"
                  }`}
                />
              );
            }}
          />

          <div className="space-y-3">

            <div className="text-sm text-zinc-500">
              {DIAS[date.getDay()]},{" "}
              {date.getDate()} de{" "}
              {MESES[date.getMonth()]}
            </div>

            {isPastDay ? (

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">

                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <AlertTriangle size={14} />
                  Este dia já passou — não é possível fazer alterações.
                </div>

                {historico.some(
                  (h) =>
                    h.data === iso
                ) ? (

                  <ul className="text-sm text-zinc-300 space-y-1">

                    {historico
                      .filter(
                        (h) =>
                          h.data === iso
                      )
                      .map((h, i) => (
                        <li key={i}>
                          ⭐ Foste à aula das{" "}
                          {hhmm(h.hora)}
                        </li>
                      ))}

                  </ul>

                ) : (

                  <div className="text-sm text-zinc-600">
                    Não tens registo de treinos neste dia.
                  </div>

                )}

              </div>

            ) : (

              <>

                {resumoSemanaSelecionada && (
                  <div
                    className={`text-xs rounded-lg px-3 py-2 border ${
                      semanaSelecionadaCheia
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    Semana de{" "}
                    {formatDiaMes(resumoSemanaSelecionada.semana_inicio)} a{" "}
                    {formatDiaMes(resumoSemanaSelecionada.semana_fim)}:{" "}
                    {resumoSemanaSelecionada.usados}/
                    {resumoSemanaSelecionada.frequencia} treinos usados
                    {semanaSelecionadaCheia
                      ? " — limite semanal atingido."
                      : ` — ${resumoSemanaSelecionada.disponiveis} disponíve${
                          resumoSemanaSelecionada.disponiveis === 1 ? "l" : "is"
                        }.`}
                  </div>
                )}

                {templatesHoje.length === 0 && (
                  <div className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    Não há turmas disponíveis à{" "}
                    {DIAS[date.getDay()]}.
                  </div>
                )}

                {loadingDia && (
                  <div className="text-zinc-600 text-sm">
                    A carregar vagas…
                  </div>
                )}

                {!loadingDia &&
                  templatesHoje.map((t) => {

                    const disponivel =
                      ocupacaoHoje[t.id] !== false;

                    const cheio =
                      !disponivel;

                    const minhaMarcacao =
                      minhasMarcacoes.find(
                        (b) =>
                          b.turma_id ===
                            t.id &&
                          b.data === iso
                      );

                    const jaPassou =
                      isSameDayAsToday &&
                      classDateTime(
                        iso,
                        t.hora
                      ) <= lisbonNow();

                    const bloqueadoPelaSemana =
                      !minhaMarcacao &&
                      semanaSelecionadaCheia;

                    return (
                      <div
                        key={t.id}
                        className={`bg-zinc-900 border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap ${
                          cheio || bloqueadoPelaSemana
                            ? "border-rose-500/40"
                            : "border-zinc-800"
                        }`}
                      >

                        <div className="flex items-center gap-3">

                          <span className="font-mono-id text-lime-400 text-lg">
                            {hhmm(t.hora)}
                          </span>

                          {jaPassou ? (

                            <span className="text-xs font-medium px-2 py-1 rounded-md bg-amber-500/15 text-amber-400">
                              Já passou
                            </span>

                          ) : minhaMarcacao ? null : (

                            <span
                              className={`text-xs font-medium px-2 py-1 rounded-md ${
                                cheio || bloqueadoPelaSemana
                                  ? "bg-rose-500/15 text-rose-400"
                                  : "bg-emerald-500/15 text-emerald-400"
                              }`}
                            >
                              {cheio
                                ? "Turma completa"
                                : bloqueadoPelaSemana
                                ? "Limite semanal atingido"
                                : "Vaga disponível"}
                            </span>

                          )}

                        </div>

                        {minhaMarcacao ? (

                          jaPassou ? (

                            <span className="text-sky-400 text-sm flex items-center gap-1">
                              <CheckCircle2 size={16} />
                              Aula concluída
                            </span>

                          ) : (

                            <div className="flex items-center gap-3">

                              <span className="text-emerald-400 text-sm flex items-center gap-1">
                                <CheckCircle2 size={16} />
                                Marcada
                              </span>

                              <button
                                disabled={busy}
                                onClick={() =>
                                  cancel(
                                    minhaMarcacao.booking_id
                                  )
                                }
                                className="text-xs text-zinc-500 hover:text-rose-400 underline"
                              >
                                Cancelar
                              </button>

                            </div>

                          )

                        ) : jaPassou ? (

                          <span className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-600">
                            Já passou
                          </span>

                        ) : (

                          <button
                            onClick={() =>
                              book(t)
                            }
                            disabled={
                              cheio ||
                              bloqueadoPelaSemana ||
                              busy
                            }
                            className={`px-4 py-2 rounded-md text-sm font-medium ${
                              cheio || bloqueadoPelaSemana || busy
                                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                : "bg-lime-400 text-zinc-950 hover:bg-lime-300"
                            }`}
                          >
                            {cheio
                              ? "Turma completa"
                              : bloqueadoPelaSemana
                              ? "Sem vagas esta semana"
                              : "Marcar"}
                          </button>

                        )}

                      </div>
                    );
                  })}

              </>
            )}

          </div>

        </div>

      </div>

    </main>
  );
}
