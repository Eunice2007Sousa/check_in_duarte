import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient";
import {
  Dumbbell,
  Plus,
  Trash2,
  Users,
  CalendarDays,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  XCircle,
  Ban,
  PackageCheck,
  Lock,
  Eye,
  EyeOff,
  Settings,
  Star,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const DIAS_ABBR = ["D", "S", "T", "Q", "Q", "S", "S"];

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
  "Dezembro",
];

const CODE_LEN = 4;
const PACK_OPTIONS = [4, 8, 12];
const CANCEL_HOURS = 12;

/* ============================================================
   DATE / TIME HELPERS
============================================================ */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}`;
}

function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
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

/*
 * Devolve a hora atual de Lisboa.
 *
 * Importante:
 * Estamos a criar um Date com os valores de Lisboa como se fossem
 * valores locais. Isto permite comparar facilmente com as datas/horas
 * das aulas guardadas como "2026-09-13" + "18:00".
 */
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

/*
 * Converte uma data ISO + hora da aula para um Date "virtual"
 * usando os valores de Lisboa.
 */
function classDateTime(dateIso, hora) {
  if (!dateIso || !hora) return null;

  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);

  return new Date(y, m - 1, d, hh, mm, 0);
}

function hoursUntilClass(dateIso, hora) {
  const classTime = classDateTime(dateIso, hora);
  if (!classTime) return -Infinity;

  const now = lisbonNow();

  return (classTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function canCancelClass(dateIso, hora) {
  return hoursUntilClass(dateIso, hora) >= CANCEL_HOURS;
}

/*
 * Timestamp vindo do Postgres é um instante real.
 * Aqui formatamos esse instante explicitamente em Lisboa.
 */
function formatTimestamp(ts) {
  if (!ts) return "";

  const d = new Date(ts);

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(",", " às");
}

/* ============================================================
   ERROR MESSAGES
============================================================ */

const ERROR_MESSAGES = {
  CREDENCIAIS_INVALIDAS: "ID ou PIN incorretos.",
  TURMA_INEXISTENTE: "Esta turma já não existe.",
  AULA_JA_PASSOU: "Esta aula já aconteceu — não é possível marcar.",
  PACK_ESGOTADO:
    "Não tens treinos disponíveis no teu pack. Fala com o Duarte.",
  JA_INSCRITO: "Já estás inscrito nesta aula.",
  TURMA_CHEIA: "Esta aula já está com as vagas todas preenchidas.",
  MARCACAO_INEXISTENTE: "Não foi possível encontrar esta marcação.",
  MENOS_DE_12H:
    "Já não é possível desmarcar: faltam menos de 12h para a aula.",
  PIN_INVALIDO: "PIN incorreto.",
  CODIGO_INVALIDO: "O código deve ter 4 dígitos.",
  CODIGO_JA_USADO: "Esse código já está a ser usado por outro atleta.",
  PIN_FORMATO_INVALIDO: "O novo PIN deve ter 4 dígitos.",
};

function friendlyError(error) {
  if (!error) {
    return "Ocorreu um erro inesperado.";
  }

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
          Faltam as variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY —
          configura-as no .env ou na Vercel.
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
                  p_pin: digits,
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
   PIN GATE
============================================================ */

function PinGate({
  verify,
  label,
  title,
  onSuccess,
  onBack,
}) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const timer = useRef(null);

  /*
   * Guardamos as funções em refs para evitar que a alteração
   * de estado provoque uma nova verificação automática.
   */
  const verifyRef = useRef(verify);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    verifyRef.current = verify;
  }, [verify]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (digits.length !== CODE_LEN) {
      return;
    }

    clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      setChecking(true);

      try {
        const payload = await verifyRef.current(digits);

        if (payload) {
          onSuccessRef.current(payload);
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

    return () => {
      clearTimeout(timer.current);
    };
  }, [digits]);

  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
    };
  }, []);

  const press = (d) => {
    if (checking) return;
    if (digits.length >= CODE_LEN) return;

    setError("");
    setDigits((prev) => prev + d);
  };

  const clear = () => {
    if (checking) return;

    setDigits("");
    setError("");
  };

  return (
    <main className="flex flex-col items-center justify-center px-6 py-16 gap-6">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start ml-2 -mb-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-lime-400"
        >
          <ArrowLeft size={14} />
          Trocar ID
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
        <div className="text-rose-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
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
          onClick={clear}
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

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const cells = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month, -i),
      outside: true,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(year, month, d),
      outside: false,
    });
  }

  let next = 1;

  while (cells.length < 42) {
    cells.push({
      date: new Date(year, month + 1, next++),
      outside: true,
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
  onMonthChange,
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewMonth.getFullYear(),
    viewMonth.getMonth(),
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
          {MESES[viewMonth.getMonth()]}{" "}
          {viewMonth.getFullYear()}
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
            className="px-3 py-2 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-lime-400 hover:border-lime-400/40"
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
   ÁREA DO DUARTE
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
  onClick,
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm border ${
        active
          ? "border-lime-400 text-lime-400"
          : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
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
  const [inscritosPorTurma, setInscritosPorTurma] =
    useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const iso = isoDate(date);

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      const { data, error } =
        await supabase.rpc("fn_listar_turmas");

      if (cancelled) return;

      if (error) {
        setError(friendlyError(error));
        return;
      }

      setTurmas(data || []);
    }

    carregar();

    return () => {
      cancelled = true;
    };
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

      const { data, error } =
        await supabase.rpc("fn_resumo_periodo", {
          p_owner_pin: ownerPin,
          p_desde: desde,
          p_ate: ate,
        });

      if (error) {
        setError(friendlyError(error));
        return;
      }

      setResumoMes(data || []);
    },
    [ownerPin]
  );

  const templatesHoje = turmas
    .filter(
      (t) => t.dia_semana === date.getDay()
    )
    .sort((a, b) =>
      a.hora.localeCompare(b.hora)
    );

  useEffect(() => {
    let cancelled = false;

    async function carregarInscritos() {
      if (templatesHoje.length === 0) {
        setInscritosPorTurma({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const results = await Promise.all(
        templatesHoje.map((t) =>
          supabase.rpc("fn_ver_inscritos", {
            p_owner_pin: ownerPin,
            p_turma_id: t.id,
            p_data: iso,
          })
        )
      );

      if (cancelled) return;

      const firstError = results.find(
        (r) => r.error
      );

      if (firstError?.error) {
        setError(friendlyError(firstError.error));
        setLoading(false);
        return;
      }

      const map = {};

      templatesHoje.forEach((t, i) => {
        map[t.id] = results[i].data || [];
      });

      setInscritosPorTurma(map);
      setLoading(false);
    }

    carregarInscritos();

    return () => {
      cancelled = true;
    };
  }, [iso, turmas, ownerPin]);

  const marker = (d) => {
    const dIso = isoDate(d);

    const rows = resumoMes.filter(
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
          {DIAS[date.getDay()]},{" "}
          {date.getDate()} de{" "}
          {MESES[date.getMonth()]}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-400">
            {error}
          </div>
        )}

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
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } =
      await supabase.rpc("fn_listar_turmas");

    if (error) {
      setError(friendlyError(error));
      return;
    }

    setTurmas(data || []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const addTemplate = async () => {
    setError("");
    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_criar_turma",
      {
        p_owner_pin: ownerPin,
        p_dia_semana: Number(dia),
        p_hora: hora,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    await carregar();
  };

  const removeTemplate = async (id) => {
    setError("");
    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_remover_turma",
      {
        p_owner_pin: ownerPin,
        p_turma_id: id,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    await carregar();
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

        <div className="flex flex-col sm:flex-row gap-3 min-w-0">
          <select
            value={dia}
            onChange={(e) =>
              setDia(e.target.value)
            }
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full min-w-0"
          >
            {DIAS.map((d, i) => (
              <option key={i} value={i}>
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
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full sm:w-36 min-w-0 font-mono-id"
          />

          <button
            disabled={loading}
            onClick={addTemplate}
            className="flex items-center justify-center gap-2 bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300 disabled:opacity-50 whitespace-nowrap shrink-0"
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
                disabled={loading}
                onClick={() =>
                  removeTemplate(t.id)
                }
                className="text-zinc-600 hover:text-rose-400 disabled:opacity-40"
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
  const [newCode, setNewCode] = useState("");
  const [newPack, setNewPack] = useState(
    PACK_OPTIONS[0]
  );

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [editingCode, setEditingCode] = useState(null);
  const [editCodeValue, setEditCodeValue] =
    useState("");

  const carregar = useCallback(async () => {
    const [
      { data: lista, error: listaError },
      { data: prox, error: proxError },
    ] = await Promise.all([
      supabase.rpc("fn_listar_atletas", {
        p_owner_pin: ownerPin,
      }),

      supabase.rpc("fn_proximo_numero_id"),
    ]);

    if (listaError) {
      setError(friendlyError(listaError));
      return;
    }

    if (proxError) {
      setError(friendlyError(proxError));
      return;
    }

    setAtletas(lista || []);
    setProximoId(prox ?? null);
  }, [ownerPin]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const addAtleta = async () => {
    setError("");

    if (!/^\d{4}$/.test(newCode)) {
      setError(
        `O código deve ter exatamente ${CODE_LEN} dígitos.`
      );
      return;
    }

    if (!newName.trim()) {
      setError("Indica o nome do atleta.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_criar_atleta",
      {
        p_owner_pin: ownerPin,
        p_nome: newName.trim(),
        p_codigo: newCode,
        p_pack_total: newPack,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    setNewName("");
    setNewCode("");

    await carregar();
  };

  const removeAtleta = async (id) => {
    setError("");
    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_remover_atleta",
      {
        p_owner_pin: ownerPin,
        p_atleta_id: id,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    await carregar();
  };

  const assignPack = async (id, total) => {
    setError("");
    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_atribuir_pack",
      {
        p_owner_pin: ownerPin,
        p_atleta_id: id,
        p_pack_total: total,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    setAssigning(null);

    await carregar();
  };

  const saveCode = async (id) => {
    setError("");

    if (!/^\d{4}$/.test(editCodeValue)) {
      setError(
        `O código deve ter exatamente ${CODE_LEN} dígitos.`
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_alterar_codigo_atleta",
      {
        p_owner_pin: ownerPin,
        p_atleta_id: id,
        p_novo_codigo: editCodeValue,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    setEditingCode(null);
    setEditCodeValue("");

    await carregar();
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
            : ""}
          . Define também um código de {CODE_LEN} dígitos
          que só o atleta deve saber.
        </div>

        <div className="flex flex-col sm:flex-row gap-3 min-w-0">
          <input
            value={newName}
            onChange={(e) =>
              setNewName(e.target.value)
            }
            placeholder="Nome do atleta"
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full min-w-0"
          />

          <input
            value={newCode}
            onChange={(e) =>
              setNewCode(
                e.target.value
                  .replace(/\D/g, "")
                  .slice(0, CODE_LEN)
              )
            }
            placeholder="Código (ex: 4821)"
            inputMode="numeric"
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full sm:w-40 min-w-0 font-mono-id"
          />

          <select
            value={newPack}
            onChange={(e) =>
              setNewPack(Number(e.target.value))
            }
            className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full sm:w-40 min-w-0"
          >
            {PACK_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p} treinos
              </option>
            ))}
          </select>

          <button
            disabled={loading}
            onClick={addAtleta}
            className="flex items-center justify-center gap-2 bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300 disabled:opacity-50 whitespace-nowrap shrink-0"
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
        {atletas.length === 0 && (
          <div className="p-4 text-zinc-500 text-sm">
            Ainda não há atletas.
          </div>
        )}

        {atletas.map((a) => {
          const restantes =
            a.pack_total - a.pack_usado;

          const pct =
            a.pack_total > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    (restantes / a.pack_total) *
                      100
                  )
                )
              : 0;

          return (
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
                  {restantes} de {a.pack_total} treinos
                  restantes
                </div>

                <div className="w-32 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full ${
                      restantes === 0
                        ? "bg-rose-500"
                        : "bg-lime-400"
                    }`}
                    style={{
                      width: `${pct}%`,
                    }}
                  />
                </div>

                <div className="flex items-center gap-2 mt-2">
                  {editingCode === a.id ? (
                    <>
                      <input
                        autoFocus
                        value={editCodeValue}
                        onChange={(e) =>
                          setEditCodeValue(
                            e.target.value
                              .replace(/\D/g, "")
                              .slice(
                                0,
                                CODE_LEN
                              )
                          )
                        }
                        inputMode="numeric"
                        className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs w-20 font-mono-id"
                      />

                      <button
                        disabled={loading}
                        onClick={() =>
                          saveCode(a.id)
                        }
                        className="text-xs text-lime-400 disabled:opacity-40"
                      >
                        Guardar
                      </button>

                      <button
                        onClick={() => {
                          setEditingCode(null);
                          setEditCodeValue("");
                        }}
                        className="text-xs text-zinc-500"
                      >
                        cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-mono-id text-xs text-zinc-400 tracking-widest">
                        {revealed[a.id]
                          ? a.codigo
                          : "••••"}
                      </span>

                      <button
                        onClick={() =>
                          setRevealed((r) => ({
                            ...r,
                            [a.id]: !r[a.id],
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

                      <button
                        onClick={() => {
                          setEditingCode(a.id);
                          setEditCodeValue(
                            a.codigo
                          );
                        }}
                        className="text-xs text-zinc-500 hover:text-lime-400 underline"
                      >
                        alterar código
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {assigning === a.id ? (
                  <div className="flex items-center gap-2">
                    {PACK_OPTIONS.map((p) => (
                      <button
                        key={p}
                        disabled={loading}
                        onClick={() =>
                          assignPack(a.id, p)
                        }
                        className="px-3 py-1.5 rounded-md border border-lime-400 text-lime-400 text-xs hover:bg-lime-400 hover:text-zinc-950 disabled:opacity-40"
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      onClick={() =>
                        setAssigning(null)
                      }
                      className="text-zinc-500 text-xs px-2"
                    >
                      cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={loading}
                    onClick={() =>
                      setAssigning(a.id)
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 text-xs hover:text-lime-400 hover:border-lime-400/40 disabled:opacity-40"
                  >
                    <PackageCheck size={14} />
                    Atribuir novo pack
                  </button>
                )}

                <button
                  disabled={loading}
                  onClick={() =>
                    removeAtleta(a.id)
                  }
                  className="text-zinc-600 hover:text-rose-400 disabled:opacity-40"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   OWNER SETTINGS
============================================================ */

function OwnerSettings({
  ownerPin,
  onPinChanged,
}) {
  const [newPin, setNewPin] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const savePin = async () => {
    setError("");
    setSaved(false);

    if (!/^\d{4}$/.test(newPin)) {
      setError(
        "O novo PIN deve ter 4 dígitos."
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.rpc(
      "fn_alterar_pin_dono",
      {
        p_pin_atual: ownerPin,
        p_novo_pin: newPin,
      }
    );

    setLoading(false);

    if (error) {
      setError(friendlyError(error));
      return;
    }

    onPinChanged(newPin);
    setNewPin("");
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 max-w-md">
      <div className="font-display text-xl tracking-wide text-zinc-200">
        Código de acesso do Duarte
      </div>

      <div className="text-xs text-zinc-500">
        Este é o código pedido sempre que se entra na
        Área do Duarte. Só tu o deves saber.
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
          inputMode="numeric"
          placeholder={`Novo código (${CODE_LEN} dígitos)`}
          className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm w-full font-mono-id"
        />

        <button
          disabled={loading}
          onClick={savePin}
          className="bg-lime-400 text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-lime-300 disabled:opacity-50 whitespace-nowrap"
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
   AUDIT LOG
============================================================ */

const ACTION_LABELS = {
  marcacao: {
    label: "Marcação",
    color:
      "bg-emerald-500/15 text-emerald-400",
  },

  desmarcacao: {
    label: "Desmarcação",
    color:
      "bg-zinc-700/40 text-zinc-300",
  },

  tentativa_bloqueada: {
    label:
      "Tentativa de desmarcação bloqueada",
    color:
      "bg-amber-500/15 text-amber-400",
  },
};

function OwnerAuditLog({ ownerPin }) {
  const [atletas, setAtletas] = useState([]);
  const [atletaId, setAtletaId] = useState("");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      const { data, error } =
        await supabase.rpc(
          "fn_listar_atletas",
          {
            p_owner_pin: ownerPin,
          }
        );

      if (cancelled) return;

      if (error) {
        setError(friendlyError(error));
        return;
      }

      const lista = data || [];

      setAtletas(lista);

      if (lista.length > 0) {
        setAtletaId(
          String(lista[0].id)
        );
      } else {
        setAtletaId("");
      }
    }

    carregar();

    return () => {
      cancelled = true;
    };
  }, [ownerPin]);

  useEffect(() => {
    if (!atletaId) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setError("");

      const { data, error } =
        await supabase.rpc(
          "fn_auditoria_atleta",
          {
            p_owner_pin: ownerPin,
            p_atleta_id: atletaId,
          }
        );

      if (cancelled) return;

      if (error) {
        setError(friendlyError(error));
        setEntries([]);
        setLoading(false);
        return;
      }

      setEntries(data || []);
      setLoading(false);
    }

    carregar();

    return () => {
      cancelled = true;
    };
  }, [atletaId, ownerPin]);

  const atleta = atletas.find(
    (a) => String(a.id) === String(atletaId)
  );

  const hoje = startOfDay(lisbonNow());
  const desde = addMonths(hoje, -1);

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="font-display text-xl tracking-wide text-zinc-200">
          Registo de atividade
        </div>

        <div className="text-xs text-zinc-500">
          Mostra marcações, desmarcações e tentativas de
          desmarcação bloqueadas entre{" "}
          {isoDate(desde)} e {isoDate(hoje)}{" "}
          (último mês).
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

        {error && (
          <div className="text-rose-400 text-sm">
            {error}
          </div>
        )}
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
                  "bg-zinc-700/40 text-zinc-300",
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
                  {formatTimestamp(e.criado_em)}
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

    return (
      <PinGate
        title={`${candidate.nome} - ID ${candidate.numero_id}`}
        label="Insere o teu PIN para acesso à tua área"
        verify={async (digits) => {
          const { data, error } =
            await supabase.rpc(
              "fn_login_atleta",
              {
                p_numero_id:
                  candidate.numero_id,
                p_codigo: digits,
              }
            );

          if (error) throw error;

          if (!data || data.length === 0) {
            return null;
          }

          return {
            ...data[0],
            codigo: digits,
          };
        }}
        onSuccess={setSession}
        onBack={() => setCandidate(null)}
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
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] =
    useState(false);

  const MAX_ID_LEN = 6;

  const press = (d) => {
    if (checking) return;
    if (digits.length >= MAX_ID_LEN) return;

    setError("");
    setDigits((p) => p + d);
  };

  const clearAll = () => {
    if (checking) return;

    setDigits("");
    setError("");
  };

  const submit = async () => {
    if (!digits || checking) return;

    setChecking(true);
    setError("");

    try {
      const { data, error } =
        await supabase.rpc(
          "fn_buscar_nome_atleta",
          {
            p_numero_id: Number(digits),
          }
        );

      if (error) throw error;

      if (data && data.length > 0) {
        onFound(data[0]);
      } else {
        setError("ID não reconhecido.");
        setDigits("");
      }
    } catch (e) {
      setError(friendlyError(e));
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
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
          (n) => (
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
          )
        )}

        <button
          disabled={checking}
          onClick={clearAll}
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
   ATLETA DASHBOARD
============================================================ */

function AtletaDashboard({
  session,
  onSessionUpdate,
  onSwitch,
}) {
  const today = startOfDay(lisbonNow());

  /*
   * Mantemos a mesma regra da tua aplicação:
   * hoje + 1 mês.
   */
  const maxBookingDate = addMonths(
    today,
    1
  );

  const [date, setDate] = useState(today);

  const [turmas, setTurmas] = useState([]);

  const [minhasMarcacoes, setMinhasMarcacoes] =
    useState([]);

  const [historico, setHistorico] =
    useState([]);

  const [
    disponibilidadeMes,
    setDisponibilidadeMes,
  ] = useState([]);

  const [ocupacaoHoje, setOcupacaoHoje] =
    useState({});

  const [loadingDia, setLoadingDia] =
    useState(false);

  const [feedback, setFeedback] =
    useState(null);

  const [busy, setBusy] =
    useState(false);

  const feedbackTimer = useRef(null);

  const iso = isoDate(date);

  const isPastDay = date < today;

  const isSameDayAsToday = sameDay(
    date,
    today
  );

  const notify = (status, text) => {
    clearTimeout(feedbackTimer.current);

    setFeedback({
      status,
      text,
    });

    feedbackTimer.current = setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  useEffect(() => {
    return () => {
      clearTimeout(feedbackTimer.current);
    };
  }, []);

  const carregarTudo = useCallback(
    async () => {
      const [
        { data: t, error: tError },
        { data: minhas, error: minhasError },
        { data: hist, error: histError },
        { data: loginRow, error: loginError },
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
              session.codigo,
          }
        ),

        supabase.rpc(
          "fn_historico_marcacoes",
          {
            p_numero_id:
              session.numero_id,
            p_codigo:
              session.codigo,
          }
        ),

        supabase.rpc(
          "fn_login_atleta",
          {
            p_numero_id:
              session.numero_id,
            p_codigo:
              session.codigo,
          }
        ),
      ]);

      const firstError =
        tError ||
        minhasError ||
        histError ||
        loginError;

      if (firstError) {
        notify(
          "error",
          friendlyError(firstError)
        );
        return;
      }

      setTurmas(t || []);
      setMinhasMarcacoes(
        minhas || []
      );
      setHistorico(hist || []);

      if (
        loginRow &&
        loginRow.length > 0
      ) {
        onSessionUpdate((prev) => ({
          ...prev,
          ...loginRow[0],
          codigo: session.codigo,
        }));
      }
    },
    [
      session.numero_id,
      session.codigo,
      onSessionUpdate,
    ]
  );

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const carregarOcupacaoDoDia =
    useCallback(
      async (targetDate, turmasList) => {
        const dIso = isoDate(
          targetDate
        );

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
          setLoadingDia(false);
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
                  p_data: dIso,
                }
              )
            )
          );

        const firstError =
          results.find(
            (r) => r.error
          );

        if (firstError?.error) {
          notify(
            "error",
            friendlyError(
              firstError.error
            )
          );

          setLoadingDia(false);
          return;
        }

        const map = {};

        templatesDoDia.forEach(
          (t, i) => {
            /*
             * O RPC devolve apenas booleano.
             * Nunca mostramos a contagem real ao atleta.
             */
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
    } else {
      setOcupacaoHoje({});
    }
  }, [
    date,
    turmas,
    carregarOcupacaoDoDia,
  ]);

  const handleMonthChange =
    useCallback(
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

        const { data, error } =
          await supabase.rpc(
            "fn_disponibilidade_periodo",
            {
              p_desde: desde,
              p_ate: ate,
            }
          );

        if (error) {
          notify(
            "error",
            friendlyError(error)
          );
          return;
        }

        setDisponibilidadeMes(
          data || []
        );
      },
      []
    );

  const book = async (template) => {
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
          p_data: iso,
        }
      );

    if (error) {
      setBusy(false);
      notify(
        "error",
        friendlyError(error)
      );
      return;
    }

    notify(
      "success",
      `Aula de ${hhmm(
        template.hora
      )} marcada com sucesso!`
    );

    await carregarTudo();

    await carregarOcupacaoDoDia(
      date,
      turmas
    );

    setBusy(false);
  };

  const cancel = async (
    bookingId,
    bookingDate,
    bookingHour
  ) => {
    if (busy) return;

    /*
     * Bloqueio também na interface.
     * A regra verdadeira continua no Postgres.
     */
    if (
      bookingDate &&
      bookingHour &&
      !canCancelClass(
        bookingDate,
        bookingHour
      )
    ) {
      notify(
        "error",
        ERROR_MESSAGES.MENOS_DE_12H
      );
      return;
    }

    setBusy(true);

    const {
      data,
      error,
    } = await supabase.rpc(
      "fn_desmarcar_aula",
      {
        p_numero_id:
          session.numero_id,
        p_codigo:
          session.codigo,
        p_booking_id:
          bookingId,
      }
    );

    if (error) {
      setBusy(false);
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
      setBusy(false);

      notify(
        "error",
        ERROR_MESSAGES[
          resultado.motivo
        ] ||
          resultado.motivo ||
          "Não foi possível cancelar a marcação."
      );

      return;
    }

    notify(
      "success",
      "Marcação cancelada."
    );

    await carregarTudo();

    await carregarOcupacaoDoDia(
      date,
      turmas
    );

    setBusy(false);
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
            bookingId,
        }
      );

    if (error) {
      setBusy(false);

      notify(
        "error",
        friendlyError(error)
      );

      return;
    }

    await carregarTudo();

    setBusy(false);
  };

  const templatesHoje = turmas
    .filter(
      (t) =>
        t.dia_semana ===
        date.getDay()
    )
    .sort((a, b) =>
      a.hora.localeCompare(b.hora)
    );

  const restantes =
    session.pack_total -
    session.pack_usado;

  const pct =
    session.pack_total > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (restantes /
              session.pack_total) *
              100
          )
        )
      : 0;

  return (
    <main className="px-6 py-8 max-w-3xl w-full mx-auto space-y-6">
      {/* =====================================================
          1. NOME + PACK
      ===================================================== */}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-display text-2xl tracking-wide text-zinc-100">
            {session.nome}
          </div>

          <div className="text-sm text-zinc-500">
            {restantes} de{" "}
            {session.pack_total}{" "}
            treinos restantes no pack
          </div>

          <div className="w-48 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${
                restantes === 0
                  ? "bg-rose-500"
                  : "bg-lime-400"
              }`}
              style={{
                width: `${pct}%`,
              }}
            />
          </div>
        </div>

        <button
          onClick={onSwitch}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-lime-400"
        >
          <ArrowLeft size={16} />
          Sair
        </button>
      </div>

      {/* =====================================================
          FEEDBACK
      ===================================================== */}

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border flex items-center gap-2 ${
            feedback.status ===
            "success"
              ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
              : "bg-rose-500/15 border-rose-500 text-rose-400"
          }`}
        >
          {feedback.status ===
          "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}

          {feedback.text}
        </div>
      )}

      {/* =====================================================
          2. MINHAS AULAS
      ===================================================== */}

      <div>
        <div className="font-display text-xl tracking-wide text-zinc-200 mb-3">
          As minhas aulas marcadas
        </div>

        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
          {minhasMarcacoes.length ===
            0 && (
            <div className="p-4 text-zinc-500 text-sm">
              Ainda não tens aulas
              marcadas.
            </div>
          )}

          {minhasMarcacoes.map(
            (b) => {
              const concluida =
                classDateTime(
                  b.data,
                  b.hora
                ) <= lisbonNow();

              const podeCancelar =
                !concluida &&
                canCancelClass(
                  b.data,
                  b.hora
                );

              return (
                <div
                  key={b.booking_id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 text-sm flex-wrap"
                >
                  <span className="text-zinc-300">
                    {b.data} —{" "}
                    {DIAS[
                      b.dia_semana
                    ]}{" "}
                    às{" "}
                    <span className="font-mono-id text-lime-400">
                      {hhmm(
                        b.hora
                      )}
                    </span>
                  </span>

                  {concluida ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium px-2 py-1 rounded-md bg-sky-500/15 text-sky-400">
                        Aula concluída
                      </span>

                      <button
                        disabled={
                          busy
                        }
                        onClick={() =>
                          dismiss(
                            b.booking_id
                          )
                        }
                        className="text-xs text-zinc-500 hover:text-lime-400 underline disabled:opacity-40"
                      >
                        Descartar
                      </button>
                    </div>
                  ) : podeCancelar ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        cancel(
                          b.booking_id,
                          b.data,
                          b.hora
                        )
                      }
                      className="text-zinc-600 hover:text-rose-400 disabled:opacity-40"
                      title="Cancelar marcação"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span className="text-xs text-amber-400">
                      Menos de 12h
                    </span>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* =====================================================
          3. CALENDÁRIO
      ===================================================== */}

      <div>
        <div className="font-display text-xl tracking-wide text-zinc-200 mb-1">
          Marcar aula
        </div>

        <div className="text-xs text-zinc-500 mb-3">
          Pode marcar ou desmarcar entre
          hoje e{" "}
          {maxBookingDate.getDate()} de{" "}
          {
            MESES[
              maxBookingDate.getMonth()
            ]
          }
          . Pode desmarcar aulas até
          12h antes.
        </div>

        <div className="grid md:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">
          <MonthCalendar
            selected={date}
            onSelect={setDate}
            maxDate={
              maxBookingDate
            }
            onMonthChange={
              handleMonthChange
            }
            renderMarker={(d) => {
              const dStart =
                startOfDay(d);

              const dIso =
                isoDate(d);

              if (dStart <= today) {
                const foiTreinar =
                  historico.some(
                    (h) =>
                      h.data ===
                      dIso
                  );

                if (!foiTreinar) {
                  return null;
                }

                return (
                  <Star
                    size={9}
                    className="text-yellow-400 fill-yellow-400"
                  />
                );
              }

              const rows =
                disponibilidadeMes.filter(
                  (r) =>
                    r.data ===
                    dIso
                );

              if (
                rows.length === 0
              ) {
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
              {DIAS[
                date.getDay()
              ]}
              , {date.getDate()} de{" "}
              {
                MESES[
                  date.getMonth()
                ]
              }
            </div>

            {isPastDay ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <AlertTriangle size={14} />
                  Este dia já passou —
                  não é possível fazer
                  alterações.
                </div>

                {historico.some(
                  (h) =>
                    h.data === iso
                ) ? (
                  <ul className="text-sm text-zinc-300 space-y-1">
                    {historico
                      .filter(
                        (h) =>
                          h.data ===
                          iso
                      )
                      .map((h, i) => (
                        <li key={i}>
                          ⭐ Foste à aula
                          das{" "}
                          {hhmm(
                            h.hora
                          )}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="text-sm text-zinc-600">
                    Não tens registo de
                    treinos neste dia.
                  </div>
                )}
              </div>
            ) : (
              <>
                {templatesHoje.length ===
                  0 && (
                  <div className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    Não há turmas
                    disponíveis à{" "}
                    {
                      DIAS[
                        date.getDay()
                      ]
                    }
                    .
                  </div>
                )}

                {loadingDia && (
                  <div className="text-zinc-600 text-sm">
                    A carregar vagas…
                  </div>
                )}

                {!loadingDia &&
                  templatesHoje.map(
                    (t) => {
                      const disponivel =
                        ocupacaoHoje[
                          t.id
                        ] !== false;

                      const cheio =
                        !disponivel;

                      const minhaMarcacao =
                        minhasMarcacoes.find(
                          (b) =>
                            b.turma_id ===
                              t.id &&
                            b.data ===
                              iso
                        );

                      const jaPassou =
                        isSameDayAsToday &&
                        classDateTime(
                          iso,
                          t.hora
                        ) <=
                          lisbonNow();

                      const podeCancelar =
                        minhaMarcacao &&
                        !jaPassou &&
                        canCancelClass(
                          iso,
                          t.hora
                        );

                      return (
                        <div
                          key={t.id}
                          className={`bg-zinc-900 border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap ${
                            cheio
                              ? "border-rose-500/40"
                              : "border-zinc-800"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono-id text-lime-400 text-lg">
                              {hhmm(
                                t.hora
                              )}
                            </span>

                            {jaPassou ? (
                              <span className="text-xs font-medium px-2 py-1 rounded-md bg-amber-500/15 text-amber-400">
                                Já passou
                              </span>
                            ) : (
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded-md ${
                                  cheio
                                    ? "bg-rose-500/15 text-rose-400"
                                    : "bg-emerald-500/15 text-emerald-400"
                                }`}
                              >
                                {cheio
                                  ? "Turma completa"
                                  : "Vaga disponível"}
                              </span>
                            )}
                          </div>

                          {minhaMarcacao ? (
                            jaPassou ? (
                              <span className="text-sky-400 text-sm flex items-center gap-1">
                                <CheckCircle2
                                  size={16}
                                />
                                Aula concluída
                              </span>
                            ) : podeCancelar ? (
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-400 text-sm flex items-center gap-1">
                                  <CheckCircle2
                                    size={16}
                                  />
                                  Marcada
                                </span>

                                <button
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    cancel(
                                      minhaMarcacao.booking_id,
                                      iso,
                                      t.hora
                                    )
                                  }
                                  className="text-xs text-zinc-500 hover:text-rose-400 underline disabled:opacity-40"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-400 text-sm flex items-center gap-1">
                                  <CheckCircle2
                                    size={16}
                                  />
                                  Marcada
                                </span>

                                <span className="text-xs text-amber-400">
                                  Menos de 12h
                                </span>
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
                                busy
                              }
                              className={`px-4 py-2 rounded-md text-sm font-medium ${
                                cheio ||
                                busy
                                  ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                  : "bg-lime-400 text-zinc-950 hover:bg-lime-300"
                              }`}
                            >
                              {cheio
                                ? "Turma completa"
                                : "Marcar"}
                            </button>
                          )}
                        </div>
                      );
                    }
                  )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
