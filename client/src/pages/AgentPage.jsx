import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { askSchemeAgent, transcribeVoice, speakAgentText } from '../api/ai.api';
import { AuthGate, AuthStatusButton } from '../components/AuthGate';
import { ensureAudioContextRunning, unlockSharedAudioContext } from '../utils/audioUnlock';
import {
  GREETING_TEXT,
  VOICE_STORAGE_KEY,
  getSavedAdvisorVoice,
  getCachedGreetingAudio,
  prefetchGreetingAudio,
} from '../utils/greetingPrefetch';

const VOICE_OPTIONS = [
  { id: 'Zephyr', label: 'Zephyr (Warm & Clear)' },
  { id: 'Kore', label: 'Kore (Calm & Steady)' },
  { id: 'Puck', label: 'Puck (Friendly & Upbeat)' },
  { id: 'Charon', label: 'Charon (Deep & Formal)' },
  { id: 'Fenrir', label: 'Fenrir (Crisp & Direct)' },
];

const BROWSER_VOICE_PROFILES = {
  Zephyr: { gender: 'female', pitch: 1.12, rate: 1.0 },
  Kore: { gender: 'female', pitch: 0.94, rate: 0.88 },
  Puck: { gender: 'male', pitch: 1.24, rate: 1.12 },
  Charon: { gender: 'male', pitch: 0.68, rate: 0.86 },
  Fenrir: { gender: 'male', pitch: 0.86, rate: 1.14 },
};

function loadSavedVoice() {
  return getSavedAdvisorVoice();
}

function SkyCloudOrb({ status = 'idle', compact = false, voiceLevel = 0, onClick }) {
  const isListening = status === 'listening';
  const isThinking = status === 'thinking' || status === 'transcribing';
  const isSpeaking = status === 'speaking';

  const sizeClass = compact
    ? 'w-20 h-20 sm:w-24 sm:h-24'
    : 'w-56 h-56 sm:w-64 sm:h-64';

  const motionClass = isSpeaking
    ? 'animate-orb-speak'
    : isThinking
      ? 'animate-orb-breathe scale-105'
      : 'animate-orb-breathe';

  const dynamicScale = isListening ? 1 + Math.min(voiceLevel * 0.22, 0.14) : 1;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        isListening
          ? 'Stop listening and send'
          : isSpeaking
            ? 'Stop speaking and ask a question'
            : 'Tap to speak your question'
      }
      className={`relative flex items-center justify-center rounded-full focus:outline-none group ${sizeClass} transition-all duration-500`}
    >
      {/* Expanding pulse rings when listening or speaking */}
      {(isListening || isSpeaking) && (
        <>
          <span className="absolute inset-0 rounded-full bg-[#4F86F7]/25 animate-orb-ring pointer-events-none" />
          <span
            className="absolute inset-0 rounded-full bg-[#60A5FA]/20 animate-orb-ring pointer-events-none"
            style={{ animationDelay: '0.8s' }}
          />
        </>
      )}

      {/* Main luminous sky-blue & white cloud orb */}
      <div
        className={`relative w-full h-full rounded-full overflow-hidden shadow-[0_22px_55px_-14px_rgba(59,130,246,0.42)] transition-transform duration-150 group-hover:scale-[1.03] ${motionClass}`}
        style={{
          transform: isListening ? `scale(${dynamicScale})` : undefined,
          background:
            'radial-gradient(circle at 46% 18%, #3B7AF6 0%, #5B92FA 36%, #9BBDFC 68%, #C6DAFE 100%)',
        }}
      >
        {/* Deep blue zenith atmospheric gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(168deg, rgba(37,99,235,0.88) 0%, rgba(79,134,247,0.58) 38%, rgba(255,255,255,0) 64%)',
          }}
        />

        {/* Soft luminous drifting white cloud band */}
        <div
          className={`absolute -inset-[22%] pointer-events-none ${isThinking ? 'animate-spin-slow' : 'animate-orb-cloud'}`}
          style={{
            background:
              'radial-gradient(ellipse 68% 34% at 54% 58%, rgba(255,255,255,0.94) 0%, rgba(240,247,255,0.78) 42%, rgba(219,234,254,0.22) 72%, rgba(255,255,255,0) 100%)',
            filter: compact ? 'blur(5px)' : 'blur(12px)',
          }}
        />

        {/* Secondary misty vapor swirl */}
        <div
          className="absolute -inset-[18%] pointer-events-none animate-orb-cloud-reverse"
          style={{
            background:
              'radial-gradient(ellipse 56% 28% at 32% 66%, rgba(255,255,255,0.88) 0%, rgba(235,244,255,0.55) 48%, rgba(255,255,255,0) 80%)',
            filter: compact ? 'blur(6px)' : 'blur(14px)',
          }}
        />

        {/* Bright upper-right mist highlight */}
        <div
          className="absolute -inset-[10%] pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 82% 48%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 45%)',
            filter: compact ? 'blur(4px)' : 'blur(10px)',
          }}
        />

        {/* Soft periwinkle bottom reflection */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 90% 42% at 50% 100%, rgba(165,196,253,0.72) 0%, rgba(255,255,255,0) 68%)',
          }}
        />

        {/* Crisp inner rim light */}
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/50 pointer-events-none" />
      </div>
    </button>
  );
}

function VoiceEqualizer({ active }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-end gap-0.5 h-3.5" aria-hidden="true">
      <span className="w-1 h-2 bg-[#2563EB] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-3.5 bg-[#3B82F6] rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
      <span className="w-1 h-2.5 bg-[#60A5FA] rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
      <span className="w-1 h-3 bg-[#2563EB] rounded-full animate-bounce" style={{ animationDelay: '80ms' }} />
    </span>
  );
}

function SchemeOverviewCard({ scheme, onProceedSingle }) {
  const topBenefit = Array.isArray(scheme.benefits) && scheme.benefits[0] ? scheme.benefits[0] : null;

  return (
    <article className="bg-white border border-black/10 rounded-2xl p-4 sm:p-5 shadow-[0_3px_14px_rgba(0,0,0,0.03)] flex flex-col justify-between gap-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {scheme.level && (
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              {scheme.level}
            </span>
          )}
          {scheme.state && (
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded bg-neutral-100 text-neutral-700">
              {scheme.state}
            </span>
          )}
        </div>

        <h3 className="text-base font-display font-bold text-neutral-900 leading-snug">
          {scheme.scheme_name}
        </h3>
        {scheme.ministry && (
          <p className="text-[11px] text-neutral-500 font-medium">{scheme.ministry}</p>
        )}
        {scheme.brief_description && (
          <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed pt-0.5">
            {scheme.brief_description}
          </p>
        )}
        {topBenefit && (
          <p className="text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200/70 rounded-lg px-2.5 py-1.5 mt-2">
            <span className="font-semibold">Key Benefit:</span> {topBenefit}
          </p>
        )}
      </div>

      <div className="pt-2 border-t border-black/5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onProceedSingle(scheme)}
          className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition"
        >
          Proceed to Details & Eligibility →
        </button>
      </div>
    </article>
  );
}

function EligibilityFormModal({
  schemeCount,
  questions,
  answers,
  extraNote,
  onExtraNoteChange,
  onSelectAnswer,
  onSubmit,
  onSkipToDetails,
  agentStatus,
  onVoiceTap,
  disabled,
}) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  const answeredCount = Object.keys(answers).length;
  const isListening = agentStatus === 'listening';
  const isSpeaking = agentStatus === 'speaking';

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (disabled || (answeredCount === 0 && !extraNote.trim())) return;
    onSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 pt-16 pb-24 bg-[#FCFCFD]/55 backdrop-blur-[3px] animate-fade-in-up"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eligibility-form-title"
    >
      <form
        onSubmit={handleFormSubmit}
        className="w-full max-w-xl max-h-full flex flex-col bg-white border border-black/10 rounded-2xl shadow-[0_24px_65px_-12px_rgba(15,23,42,0.22)] overflow-hidden"
      >
        {/* Form Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-black/5 bg-[#F8FAFF] flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                Eligibility Form
              </span>
              <span className="text-[11px] font-mono font-semibold text-neutral-500">
                {schemeCount} {schemeCount === 1 ? 'Scheme' : 'Schemes'} Found
              </span>
            </div>
            <h3
              id="eligibility-form-title"
              className="text-base sm:text-lg font-display font-bold text-neutral-900 leading-snug"
            >
              Check Your Eligibility to Unlock Full Details
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Fill out the quick form below or answer by voice to view matching eligibility criteria & application steps.
            </p>
          </div>

          <button
            type="button"
            onClick={onVoiceTap}
            disabled={disabled}
            title={isListening ? 'Listening — tap to send' : 'Answer by voice'}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              isListening
                ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-sm'
                : isSpeaking
                  ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
                  : 'bg-white text-neutral-700 border-black/10 hover:border-[#2563EB]/50 hover:text-[#2563EB]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? 'bg-white animate-ping'
                  : isSpeaking
                    ? 'bg-[#2563EB] animate-pulse'
                    : 'bg-[#2563EB]'
              }`}
            />
            <span>{isListening ? 'Listening' : isSpeaking ? 'Speaking' : 'Speak'}</span>
          </button>
        </div>

        {/* Scrollable Form Fields */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          {questions.map((q, idx) => {
            const selected = answers[q.id];
            return (
              <fieldset
                key={q.id || idx}
                className="border border-black/8 rounded-xl p-3.5 sm:p-4 bg-[#FCFCFD] space-y-2.5"
              >
                <legend className="text-xs sm:text-sm font-semibold text-neutral-900 leading-snug px-1">
                  <span className="text-[#2563EB] font-mono mr-1.5">{idx + 1}.</span>
                  {q.question}
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {(q.options || ['Yes', 'No']).map((opt) => {
                    const isActive = selected === opt;
                    return (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition select-none ${
                          isActive
                            ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8] shadow-[0_1px_4px_rgba(37,99,235,0.12)]'
                            : 'bg-white border-black/10 text-neutral-800 hover:border-[#2563EB]/40 hover:bg-neutral-50'
                        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <input
                          type="radio"
                          name={q.id || `q-${idx}`}
                          value={opt}
                          checked={isActive}
                          disabled={disabled}
                          onChange={() => onSelectAnswer(q.id, opt)}
                          className="sr-only"
                        />
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition ${
                            isActive ? 'border-[#2563EB] bg-[#2563EB]' : 'border-neutral-300 bg-white'
                          }`}
                        >
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="leading-tight">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {/* Optional Free-Text Details Field */}
          <div className="space-y-1.5 pt-1">
            <label
              htmlFor="eligibility-extra-note"
              className="block text-xs font-semibold text-neutral-700"
            >
              Additional Details <span className="font-normal text-neutral-400">(Optional)</span>
            </label>
            <input
              id="eligibility-extra-note"
              type="text"
              value={extraNote}
              disabled={disabled}
              onChange={(e) => onExtraNoteChange(e.target.value)}
              placeholder="e.g., State, startup sector, age, or annual income..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-black/10 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 transition"
            />
          </div>
        </div>

        {/* Form Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-black/5 bg-neutral-50/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <span className="text-[11px] font-mono text-neutral-500">
              {answeredCount}/{questions.length} answered
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={onSkipToDetails}
              className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition"
            >
              Skip & View Schemes
            </button>
          </div>

          <button
            type="submit"
            disabled={disabled || (answeredCount === 0 && !extraNote.trim())}
            className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-xs sm:text-sm font-semibold hover:bg-[#1D4ED8] transition disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
          >
            {disabled ? 'Checking Eligibility...' : 'Submit & View Scheme Details →'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SchemeDetailCard({ scheme, onOpenFull }) {
  const eligibility = Array.isArray(scheme.eligibility) ? scheme.eligibility : [];
  const applicationProcess = Array.isArray(scheme.application_process)
    ? scheme.application_process
    : [];
  const benefits = Array.isArray(scheme.benefits) ? scheme.benefits : [];
  const documents = Array.isArray(scheme.documents_required) ? scheme.documents_required : [];
  const officialLink = Array.isArray(scheme.references) && scheme.references[0] ? scheme.references[0] : null;
  const assessment = scheme.eligibilityAssessment || null;

  const statusMeta = assessment
    ? {
        eligible: {
          label: 'Eligible',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          bannerClass: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
        },
        partially_eligible: {
          label: 'Partially Eligible',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          bannerClass: 'bg-amber-50/70 border-amber-200 text-amber-900',
        },
        not_eligible: {
          label: 'Check Criteria',
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
          bannerClass: 'bg-rose-50/70 border-rose-200 text-rose-900',
        },
      }[assessment.status] || null
    : null;

  return (
    <article className="bg-white border border-black/10 rounded-2xl p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-black/5 pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {statusMeta && (
              <span
                className={`px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded border ${statusMeta.badgeClass}`}
              >
                {statusMeta.label}
              </span>
            )}
            {scheme.level && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                {scheme.level}
              </span>
            )}
            {scheme.state && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded bg-neutral-100 text-neutral-700">
                {scheme.state}
              </span>
            )}
            {scheme.application_mode && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Mode: {scheme.application_mode}
              </span>
            )}
          </div>

          <h3 className="text-lg font-display font-bold text-neutral-900 leading-snug">
            {scheme.scheme_name}
          </h3>
          {scheme.ministry && (
            <p className="text-xs text-neutral-500 font-medium">{scheme.ministry}</p>
          )}
          {scheme.brief_description && (
            <p className="text-sm text-neutral-700 leading-relaxed pt-1">
              {scheme.brief_description}
            </p>
          )}
        </div>

        <div className="flex sm:flex-col gap-2 shrink-0">
          {officialLink && (
            <a
              href={officialLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold hover:bg-[#1D4ED8] transition text-center whitespace-nowrap"
            >
              Apply on Official Portal ↗
            </a>
          )}
          {!scheme.isLive && (
            <button
              type="button"
              onClick={() => onOpenFull(scheme)}
              className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-800 text-xs font-semibold hover:bg-neutral-200 transition whitespace-nowrap"
            >
              Full Case File →
            </button>
          )}
        </div>
      </div>

      {/* Personalized Eligibility Assessment Summary */}
      {assessment?.summary && statusMeta && (
        <div className={`border rounded-xl px-4 py-3 text-xs sm:text-sm font-medium ${statusMeta.bannerClass}`}>
          {assessment.summary}
        </div>
      )}

      {/* Primary Two-Column Details: Eligibility Criteria & Application Details (Displayed When Proceeding!) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#F8FAFF] border border-[#DBEAFE] rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#2563EB]">
            Eligibility Criteria
          </h4>

          {Array.isArray(assessment?.checks) && assessment.checks.length > 0 && (
            <ul className="space-y-1.5 text-xs sm:text-sm text-neutral-800 pb-2 border-b border-[#DBEAFE]">
              {assessment.checks.map((chk, idx) => (
                <li key={`chk-${idx}`} className="flex items-start gap-2">
                  <span
                    className={`font-mono font-bold shrink-0 ${
                      chk.met === 'yes'
                        ? 'text-emerald-600'
                        : chk.met === 'no'
                          ? 'text-rose-600'
                          : 'text-amber-600'
                    }`}
                  >
                    {chk.met === 'yes' ? '✓' : chk.met === 'no' ? '✕' : '!'}
                  </span>
                  <span>{chk.criterion}</span>
                </li>
              ))}
            </ul>
          )}

          {eligibility.length > 0 ? (
            <ul className="space-y-2 text-xs sm:text-sm text-neutral-800 leading-relaxed">
              {eligibility.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-neutral-500">Check official portal for detailed eligibility criteria.</p>
          )}
        </div>

        <div className="bg-neutral-50 border border-black/5 rounded-xl p-4">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-800 mb-2.5">
            Application Details (How to Apply)
          </h4>
          {applicationProcess.length > 0 ? (
            <ol className="space-y-2 text-xs sm:text-sm text-neutral-800 leading-relaxed">
              {applicationProcess.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-xs font-mono font-bold text-[#2563EB] shrink-0">
                    {idx + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-neutral-500">Apply via the official government portal linked above.</p>
          )}
        </div>
      </div>

      {/* Benefits & Required Documents */}
      {(benefits.length > 0 || documents.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {benefits.length > 0 && (
            <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-4">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-700 mb-2">
                Key Benefits
              </h4>
              <ul className="space-y-1.5 text-xs sm:text-sm text-neutral-800 leading-relaxed">
                {benefits.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {documents.length > 0 && (
            <div className="bg-neutral-50 border border-black/5 rounded-xl p-4">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-700 mb-2">
                Documents Required
              </h4>
              <ul className="space-y-1.5 text-xs sm:text-sm text-neutral-800 leading-relaxed">
                {documents.map((doc, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(base64) {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function AgentWorkspace() {
  const navigate = useNavigate();

  // Pure voice + 2-stage scheme guidance state (zero user text bubbles)
  const [matchedSchemes, setMatchedSchemes] = useState([]);
  const [schemeStage, setSchemeStage] = useState('chat'); // 'chat' | 'ask_eligibility' | 'show_details'
  const [eligibilityQuestions, setEligibilityQuestions] = useState([]);
  const [eligibilityAnswers, setEligibilityAnswers] = useState({});
  const [eligibilityExtraNote, setEligibilityExtraNote] = useState('');
  const [focusedSchemeId, setFocusedSchemeId] = useState(null);
  const [liveSources, setLiveSources] = useState([]);
  const [latestSpokenReply, setLatestSpokenReply] = useState(null); // { id, text, audioBase64, audioMimeType, audioVoice }
  const [agentStatus, setAgentStatus] = useState('idle'); // 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'
  const [error, setError] = useState(null);
  const [voiceLevel, setVoiceLevel] = useState(0);

  // Panels matching top-left menu and top-right settings
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Voice settings (persisted and mirrored in refs to avoid stale closures in voice callbacks)
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(loadSavedVoice);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [testingVoice, setTestingVoice] = useState(false);

  const selectedVoiceRef = useRef(selectedVoice);
  const autoSpeakRef = useRef(autoSpeak);
  const matchedSchemesRef = useRef([]);
  const eligibilityQuestionsRef = useRef([]);

  // In-memory conversation history for multi-turn context (never rendered as text bubbles)
  const historyRef = useRef([]);

  useEffect(() => {
    matchedSchemesRef.current = matchedSchemes;
  }, [matchedSchemes]);

  useEffect(() => {
    eligibilityQuestionsRef.current = eligibilityQuestions;
  }, [eligibilityQuestions]);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, selectedVoice);
    } catch {
      // ignore
    }
  }, [selectedVoice]);

  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  // Native SpeechRecognition & fallback MediaRecorder + calibrated VAD refs
  const recognitionRef = useRef(null);
  const recognizedTextRef = useRef('');
  const manualStopRecognitionRef = useRef(false);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const vadIntervalRef = useRef(null);
  const micSourceRef = useRef(null);
  const hasSpokenRef = useRef(false);
  const speechStreakRef = useRef(0);
  const silenceStartRef = useRef(null);
  const recordingStartRef = useRef(0);

  // Playback refs
  const audioSourceRef = useRef(null);
  const htmlAudioRef = useRef(null);
  const htmlAudioUrlRef = useRef(null);
  const utteranceRef = useRef(null);
  const playbackSessionRef = useRef(0);
  const mountedRef = useRef(true);
  const greetedRef = useRef(false);

  const hasSchemes = matchedSchemes.length > 0;

  // Preload browser speech voices & play prefetched greeting immediately upon entering Find Schemes
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    if (!greetedRef.current) {
      (async () => {
        const activeVoice = selectedVoiceRef.current || 'Zephyr';
        const cached = getCachedGreetingAudio(activeVoice) || (await prefetchGreetingAudio(activeVoice));
        if (cancelled || !mountedRef.current || greetedRef.current) return;

        greetedRef.current = true;
        const spoke = await playSpokenReply({
          text: GREETING_TEXT,
          audioBase64: cached?.audioBase64 || null,
          audioMimeType: cached?.audioMimeType || 'audio/wav',
          audioVoice: cached?.audioVoice || activeVoice,
          voiceName: activeVoice,
          msgId: 'initial-greeting',
          silentIfBlocked: true,
        });
        if (!cancelled && mountedRef.current && spoke) {
          startListening({ silentOnNoSpeech: true });
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup everything on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopAudioPlayback();
      stopAllListening();
    };
  }, []);

  const cleanupVad = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      micSourceRef.current = null;
    }
    hasSpokenRef.current = false;
    speechStreakRef.current = 0;
    silenceStartRef.current = null;
    setVoiceLevel(0);
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      manualStopRecognitionRef.current = true;
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  };

  const stopMediaTracks = () => {
    cleanupVad();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopAllListening = () => {
    stopSpeechRecognition();
    stopMediaTracks();
  };

  const stopAudioPlayback = () => {
    playbackSessionRef.current += 1;

    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.onended = null;
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      audioSourceRef.current = null;
    }

    if (htmlAudioRef.current) {
      try {
        htmlAudioRef.current.onended = null;
        htmlAudioRef.current.onerror = null;
        htmlAudioRef.current.pause();
        htmlAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      htmlAudioRef.current = null;
    }

    if (htmlAudioUrlRef.current) {
      URL.revokeObjectURL(htmlAudioUrlRef.current);
      htmlAudioUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    setSpeakingMessageId(null);
    setAgentStatus((prev) => (prev === 'speaking' ? 'idle' : prev));
  };

  const speakWithBrowserSpeech = (text, msgId, sessionToken, voiceName) => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
        resolve(false);
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const activeVoice = voiceName || selectedVoiceRef.current || 'Zephyr';
        const profile = BROWSER_VOICE_PROFILES[activeVoice] || BROWSER_VOICE_PROFILES.Zephyr;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = profile.rate;
        utterance.pitch = profile.pitch;

        const allVoices = window.speechSynthesis.getVoices() || [];
        const enVoices = allVoices.filter((v) => /^en/i.test(v.lang));
        const pool = enVoices.length > 0 ? enVoices : allVoices;

        const isFemaleName = (name) =>
          /female|zira|samantha|victoria|karen|moira|tessa|neerja|heera|aria|jenny|sara|susan|hazel|linda/i.test(
            name
          );
        const isMaleName = (name) =>
          /male|david|mark|daniel|alex|rishi|prabhat|ravi|george|james|guy|ryan|richard|fred/i.test(
            name
          );

        const femalePool = pool.filter((v) => isFemaleName(v.name));
        const malePool = pool.filter((v) => isMaleName(v.name) && !isFemaleName(v.name));

        let pickedVoice = null;
        if (profile.gender === 'female' && femalePool.length > 0) {
          const idx = activeVoice === 'Kore' && femalePool.length > 1 ? 1 : 0;
          pickedVoice = femalePool[idx];
        } else if (profile.gender === 'male' && malePool.length > 0) {
          const maleOrder = { Charon: 0, Fenrir: 1, Puck: 2 };
          const idx = (maleOrder[activeVoice] ?? 0) % malePool.length;
          pickedVoice = malePool[idx];
        } else if (pool.length > 0) {
          const voiceIndex = Math.max(
            0,
            VOICE_OPTIONS.findIndex((v) => v.id === activeVoice)
          );
          pickedVoice = pool[voiceIndex % pool.length];
        }

        if (pickedVoice) {
          utterance.voice = pickedVoice;
        }

        let settled = false;
        let safetyTimer = null;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          if (safetyTimer) clearTimeout(safetyTimer);
          utteranceRef.current = null;
          if (playbackSessionRef.current === sessionToken) {
            setSpeakingMessageId(null);
            setAgentStatus('idle');
          }
          resolve(ok);
        };

        utterance.onend = () => finish(true);
        utterance.onerror = () => finish(false);

        // Keep strong ref to prevent Chrome GC from prematurely terminating speech
        utteranceRef.current = utterance;
        setSpeakingMessageId(msgId);
        setAgentStatus('speaking');

        // Small tick after cancel() prevents Chrome from silently dropping the utterance
        setTimeout(() => {
          if (settled || playbackSessionRef.current !== sessionToken) {
            finish(false);
            return;
          }
          try {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            window.speechSynthesis.speak(utterance);
            safetyTimer = setTimeout(() => finish(true), Math.max(8000, text.length * 110));
          } catch {
            finish(false);
          }
        }, 35);
      } catch {
        resolve(false);
      }
    });
  };

  const playAudioBase64 = async (audioBase64, mimeType, msgId, sessionToken) => {
    const bytes = base64ToUint8Array(audioBase64);

    // Tier 1: Shared unlocked Web Audio API (with non-hanging 150ms resume check)
    try {
      const ctx = await ensureAudioContextRunning(150);
      if (playbackSessionRef.current !== sessionToken) return false;
      if (ctx) {
        const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
        if (playbackSessionRef.current !== sessionToken) return false;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        audioSourceRef.current = source;

        return await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (playbackSessionRef.current === sessionToken) {
              audioSourceRef.current = null;
              setSpeakingMessageId(null);
              setAgentStatus('idle');
            }
            resolve(true);
          };
          source.onended = finish;
          setSpeakingMessageId(msgId);
          setAgentStatus('speaking');
          source.start(0);
          setTimeout(finish, Math.ceil(audioBuffer.duration * 1000) + 400);
        });
      }
    } catch (webAudioErr) {
      console.warn('Web Audio API playback fallback triggered:', webAudioErr);
    }

    if (playbackSessionRef.current !== sessionToken) return false;

    // Tier 2: Blob URL HTMLAudioElement (works reliably across browsers even if AudioContext was suspended)
    try {
      const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);
      htmlAudioUrlRef.current = blobUrl;

      const audio = new Audio(blobUrl);
      htmlAudioRef.current = audio;

      return await new Promise((resolve) => {
        let settled = false;
        const cleanup = (ok) => {
          if (settled) return;
          settled = true;
          if (playbackSessionRef.current === sessionToken) {
            setSpeakingMessageId(null);
            setAgentStatus('idle');
          }
          if (htmlAudioUrlRef.current === blobUrl) {
            URL.revokeObjectURL(blobUrl);
            htmlAudioUrlRef.current = null;
          }
          htmlAudioRef.current = null;
          resolve(ok);
        };

        audio.onended = () => cleanup(true);
        audio.onerror = () => cleanup(false);

        setSpeakingMessageId(msgId);
        setAgentStatus('speaking');
        audio.play().catch(() => cleanup(false));
      });
    } catch (htmlAudioErr) {
      console.warn('HTMLAudioElement playback failed:', htmlAudioErr);
      return false;
    }
  };

  const playSpokenReply = async ({
    text,
    audioBase64,
    audioMimeType,
    audioVoice,
    voiceName,
    msgId,
    silentIfBlocked = false,
  }) => {
    if (!text && !audioBase64) return false;
    stopAudioPlayback();
    const sessionToken = playbackSessionRef.current;
    const activeVoice = voiceName || selectedVoiceRef.current || 'Zephyr';

    setAgentStatus('speaking');
    setSpeakingMessageId(msgId);

    try {
      let base64 = audioBase64 && audioVoice === activeVoice ? audioBase64 : null;
      let mime = audioMimeType || 'audio/wav';

      // Fetch verified Gemini WAV audio if not already prefetched/cached
      if (!base64 && text) {
        try {
          const res = await speakAgentText(text, activeVoice);
          if (playbackSessionRef.current !== sessionToken) return false;
          if (res?.success && res?.audioBase64) {
            base64 = res.audioBase64;
            mime = res.mimeType || 'audio/wav';
            const resolvedVoice = res.voiceName || activeVoice;
            if (msgId && msgId !== 'initial-greeting' && msgId !== 'voice-test') {
              setLatestSpokenReply((prev) =>
                prev && prev.id === msgId
                  ? { ...prev, audioBase64: base64, audioMimeType: mime, audioVoice: resolvedVoice }
                  : prev
              );
            }
          }
        } catch (ttsFetchErr) {
          console.warn('Gemini TTS fetch failed, falling back to browser voice:', ttsFetchErr);
        }
      }

      if (playbackSessionRef.current !== sessionToken) return false;

      if (base64) {
        const played = await playAudioBase64(base64, mime, msgId, sessionToken);
        if (played) return true;
        if (playbackSessionRef.current !== sessionToken) return false;
      }

      // Tier 3: Distinct per-voice browser speechSynthesis fallback
      if (text) {
        const spokeFallback = await speakWithBrowserSpeech(text, msgId, sessionToken, activeVoice);
        if (spokeFallback) return true;
      }

      if (playbackSessionRef.current === sessionToken) {
        setSpeakingMessageId(null);
        setAgentStatus('idle');
        if (!silentIfBlocked) {
          setError('Audio playback was paused by your browser. Tap "Replay Voice Answer" to listen.');
        }
      }
      return false;
    } catch (err) {
      console.error('Speech playback failed:', err);
      if (playbackSessionRef.current === sessionToken) {
        setSpeakingMessageId(null);
        setAgentStatus('idle');
      }
      return false;
    }
  };

  const sendSpokenQuestion = async (rawText, structuredAnswers = null) => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return;

    unlockSharedAudioContext();
    stopAudioPlayback();
    setError(null);
    setAgentStatus('thinking');

    const currentVoice = selectedVoiceRef.current || 'Zephyr';
    const historyForApi = historyRef.current.slice(-8);
    const activeSchemesForApi = matchedSchemesRef.current;
    const pendingQuestionsForApi = eligibilityQuestionsRef.current;

    try {
      // Return scheme cards, eligibility questions/verdicts & crisp spoken summary immediately, then play verified WAV audio
      const res = await askSchemeAgent(trimmed, historyForApi, {
        includeAudio: false,
        voiceName: currentVoice,
        activeSchemes: activeSchemesForApi,
        pendingQuestions: pendingQuestionsForApi,
        eligibilityAnswers: structuredAnswers,
      });

      if (!res?.success) {
        throw new Error(res?.message || 'Unable to get a response from the AI advisor.');
      }

      const spokenText = res.spokenSummary || res.reply;
      const replyId = `reply-${Date.now()}`;

      // Keep conversational memory purely in memory (not displayed as text bubbles)
      historyRef.current = [
        ...historyRef.current.slice(-8),
        { role: 'user', content: trimmed },
        { role: 'assistant', content: res.reply },
      ];

      // Update 2-stage scheme flow cleanly
      if (Array.isArray(res.matchedSchemes) && res.matchedSchemes.length > 0) {
        setMatchedSchemes(res.matchedSchemes);
        setFocusedSchemeId(null);
        setLiveSources(Array.isArray(res.liveSources) ? res.liveSources : []);
        const nextStage = res.stage === 'ask_eligibility' ? 'ask_eligibility' : 'show_details';
        setSchemeStage(nextStage);
        if (nextStage === 'ask_eligibility') {
          setEligibilityQuestions(Array.isArray(res.eligibilityQuestions) ? res.eligibilityQuestions : []);
          setEligibilityAnswers({});
          setEligibilityExtraNote('');
        } else {
          setEligibilityQuestions([]);
          setEligibilityExtraNote('');
        }
      } else if (Array.isArray(res.liveSources) && res.liveSources.length > 0) {
        setLiveSources(res.liveSources);
      }

      const replyRecord = {
        id: replyId,
        text: spokenText,
        audioBase64: res.audioBase64 || null,
        audioMimeType: res.audioMimeType || 'audio/wav',
        audioVoice: res.audioVoice || currentVoice,
      };
      setLatestSpokenReply(replyRecord);
      setAgentStatus('idle');

      if (autoSpeakRef.current && spokenText) {
        const spoke = await playSpokenReply({
          text: replyRecord.text,
          audioBase64: replyRecord.audioBase64,
          audioMimeType: replyRecord.audioMimeType,
          audioVoice: replyRecord.audioVoice,
          voiceName: selectedVoiceRef.current || currentVoice,
          msgId: replyId,
        });
        // Ready for hands-free follow-up after finishing voice answer
        if (mountedRef.current && spoke) {
          startListening({ silentOnNoSpeech: true });
        }
      }
    } catch (err) {
      console.error('AI scheme agent error:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not reach the AI scheme advisor right now. Please tap the orb to try again.';
      setError(errMsg);
      setAgentStatus('idle');
    }
  };

  const handleSelectEligibilityAnswer = (questionId, option) => {
    setEligibilityAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const handleSubmitEligibilityAnswers = () => {
    const qaParts = eligibilityQuestions
      .map((q) => {
        const ans = eligibilityAnswers[q.id];
        return ans ? `${q.question} -> ${ans}` : null;
      })
      .filter(Boolean);

    const trimmedNote = eligibilityExtraNote.trim();
    if (trimmedNote) {
      qaParts.push(`Additional details -> ${trimmedNote}`);
    }

    const qaSummary = qaParts.join('; ');
    if (!qaSummary) return;

    const structuredPayload = {};
    eligibilityQuestions.forEach((q) => {
      if (eligibilityAnswers[q.id]) {
        structuredPayload[q.question] = eligibilityAnswers[q.id];
      }
    });
    if (trimmedNote) {
      structuredPayload['Additional details'] = trimmedNote;
    }

    sendSpokenQuestion(
      `Here are my eligibility answers: ${qaSummary}. Please check my eligibility and proceed with the full scheme details and eligibility criteria.`,
      structuredPayload
    );
  };

  const handleSkipToAllDetails = () => {
    setFocusedSchemeId(null);
    setSchemeStage('show_details');
  };

  const handleProceedSingleScheme = (scheme) => {
    setFocusedSchemeId(scheme._id);
    setSchemeStage('show_details');
  };

  const stopMediaRecorderAndSend = () => {
    cleanupVad();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      stopMediaTracks();
      setAgentStatus('idle');
    }
  };

  const startMediaRecorderFallback = async ({ silentOnNoSpeech = false } = {}) => {
    const ctx = unlockSharedAudioContext();
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Microphone recording is not supported in this browser.');
      setAgentStatus('idle');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const supportedType = preferredTypes.find(
        (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
      );

      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingStartRef.current = Date.now();
      hasSpokenRef.current = false;
      speechStreakRef.current = 0;
      silenceStartRef.current = null;

      if (ctx) {
        try {
          const micSource = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          micSource.connect(analyser);
          micSourceRef.current = micSource;

          const dataArray = new Uint8Array(analyser.fftSize);
          let ambientSum = 0;
          let ambientSamples = 0;
          let dynamicThreshold = 0.032;

          vadIntervalRef.current = setInterval(() => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
              return;
            }
            analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i += 1) {
              const normalized = (dataArray[i] - 128) / 128;
              sumSquares += normalized * normalized;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            setVoiceLevel(Math.min(rms * 5, 1));

            const now = Date.now();
            const elapsed = now - recordingStartRef.current;

            if (elapsed < 450) {
              ambientSum += rms;
              ambientSamples += 1;
              dynamicThreshold = Math.max(0.028, (ambientSum / ambientSamples) * 2.1);
              return;
            }

            if (rms > dynamicThreshold) {
              speechStreakRef.current += 1;
              if (speechStreakRef.current >= 2) {
                hasSpokenRef.current = true;
              }
              silenceStartRef.current = null;
            } else {
              speechStreakRef.current = 0;
              if (hasSpokenRef.current) {
                if (!silenceStartRef.current) {
                  silenceStartRef.current = now;
                } else if (now - silenceStartRef.current >= 950) {
                  stopMediaRecorderAndSend();
                }
              } else if (elapsed >= 9000 && silentOnNoSpeech) {
                stopMediaTracks();
                setAgentStatus('idle');
              } else if (elapsed >= 20000) {
                stopMediaRecorderAndSend();
              }
            }
          }, 80);
        } catch {
          // VAD unavailable; user can tap orb to stop & send
        }
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        cleanupVad();
        const mimeType = recorder.mimeType || supportedType || 'audio/webm';
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        if (!chunks.length) {
          setAgentStatus('idle');
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (audioBlob.size < 600) {
          setAgentStatus('idle');
          return;
        }

        setAgentStatus('transcribing');
        try {
          const base64 = await blobToBase64(audioBlob);
          const res = await transcribeVoice(base64, mimeType);
          const transcript = res?.transcript?.trim();
          if (!transcript) {
            setAgentStatus('idle');
            if (!silentOnNoSpeech) {
              setError('I did not catch that. Tap the orb and speak clearly.');
            }
            return;
          }
          await sendSpokenQuestion(transcript);
        } catch (transcribeErr) {
          console.error('Voice transcription failed:', transcribeErr);
          setAgentStatus('idle');
          setError(
            transcribeErr?.response?.data?.message ||
              transcribeErr?.message ||
              'Voice transcription failed. Please tap the orb and try again.'
          );
        }
      };

      recorder.start(250);
      setAgentStatus('listening');
    } catch (micErr) {
      console.error('Microphone access error:', micErr);
      setAgentStatus('idle');
      if (!silentOnNoSpeech) {
        setError('Microphone permission was denied. Please allow microphone access in your browser.');
      }
    }
  };

  const startListening = ({ silentOnNoSpeech = false } = {}) => {
    unlockSharedAudioContext();
    stopAudioPlayback();
    stopAllListening();
    setError(null);

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      startMediaRecorderFallback({ silentOnNoSpeech });
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognitionRef.current = recognition;
      recognizedTextRef.current = '';
      manualStopRecognitionRef.current = false;

      let fallbackTriggered = false;
      const startedAt = Date.now();

      recognition.onstart = () => {
        if (!mountedRef.current) return;
        setAgentStatus('listening');
      };

      recognition.onresult = (event) => {
        let combined = '';
        for (let i = 0; i < event.results.length; i += 1) {
          combined += event.results[i][0]?.transcript || '';
        }
        const cleaned = combined.trim();
        recognizedTextRef.current = cleaned;
        setVoiceLevel(cleaned ? 0.65 : 0.2);
      };

      recognition.onerror = (event) => {
        const errCode = event?.error || '';
        if (errCode === 'aborted') return;

        if (errCode === 'not-allowed' || errCode === 'permission-denied') {
          recognitionRef.current = null;
          setAgentStatus('idle');
          if (!silentOnNoSpeech) {
            setError('Microphone permission was denied. Please allow microphone access in your browser.');
          }
          return;
        }

        if (errCode === 'no-speech') {
          recognitionRef.current = null;
          setAgentStatus('idle');
          return;
        }

        if (!fallbackTriggered && !manualStopRecognitionRef.current) {
          fallbackTriggered = true;
          recognitionRef.current = null;
          startMediaRecorderFallback({ silentOnNoSpeech });
        }
      };

      recognition.onend = () => {
        if (fallbackTriggered) return;
        recognitionRef.current = null;
        setVoiceLevel(0);

        const finalTranscript = recognizedTextRef.current.trim();
        recognizedTextRef.current = '';

        if (finalTranscript) {
          sendSpokenQuestion(finalTranscript);
        } else if (
          !manualStopRecognitionRef.current &&
          !silentOnNoSpeech &&
          Date.now() - startedAt < 700
        ) {
          // Some browsers/iframes end SpeechRecognition immediately without error — seamlessly fall back to MediaRecorder + Gemini transcription
          fallbackTriggered = true;
          startMediaRecorderFallback({ silentOnNoSpeech });
        } else {
          setAgentStatus('idle');
        }
      };

      recognition.start();
    } catch {
      startMediaRecorderFallback({ silentOnNoSpeech });
    }
  };

  const handleOrbClick = () => {
    unlockSharedAudioContext();
    if (agentStatus === 'speaking') {
      stopAudioPlayback();
      startListening({ silentOnNoSpeech: false });
    } else if (agentStatus === 'listening') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          stopAllListening();
          setAgentStatus('idle');
        }
      } else {
        stopMediaRecorderAndSend();
      }
    } else if (agentStatus === 'idle') {
      startListening({ silentOnNoSpeech: false });
    }
  };

  const handleVoiceChange = async (newVoice) => {
    unlockSharedAudioContext();
    selectedVoiceRef.current = newVoice;
    setSelectedVoice(newVoice);
    setError(null);
    setTestingVoice(true);
    await playSpokenReply({
      text: `Hello sir, this is ${newVoice}. How can I help you with government schemes today?`,
      voiceName: newVoice,
      msgId: 'voice-test',
    });
    setTestingVoice(false);
  };

  const handleTestVoice = async () => {
    unlockSharedAudioContext();
    const activeVoice = selectedVoiceRef.current || selectedVoice;
    setTestingVoice(true);
    setError(null);
    await playSpokenReply({
      text: GREETING_TEXT,
      voiceName: activeVoice,
      msgId: 'voice-test',
    });
    setTestingVoice(false);
  };

  const handleReplayLatest = () => {
    if (!latestSpokenReply) return;
    unlockSharedAudioContext();
    if (agentStatus === 'speaking') {
      stopAudioPlayback();
    } else {
      playSpokenReply({
        text: latestSpokenReply.text,
        audioBase64: latestSpokenReply.audioBase64,
        audioMimeType: latestSpokenReply.audioMimeType,
        audioVoice: latestSpokenReply.audioVoice,
        voiceName: selectedVoiceRef.current,
        msgId: latestSpokenReply.id,
      });
    }
  };

  const handleNewChat = () => {
    stopAudioPlayback();
    stopAllListening();
    historyRef.current = [];
    setMatchedSchemes([]);
    setSchemeStage('chat');
    setEligibilityQuestions([]);
    setEligibilityAnswers({});
    setEligibilityExtraNote('');
    setFocusedSchemeId(null);
    setLiveSources([]);
    setLatestSpokenReply(null);
    setError(null);
    setAgentStatus('idle');
    setMenuOpen(false);
  };

  const handleClose = () => {
    stopAudioPlayback();
    stopAllListening();
    navigate('/');
  };

  const statusLabel = {
    idle:
      schemeStage === 'ask_eligibility' && hasSchemes
        ? 'Speak your answers to the orb or choose below to check eligibility'
        : hasSchemes
          ? 'Tap the orb to ask another question'
          : GREETING_TEXT,
    listening: 'Listening...',
    transcribing: 'Understanding your voice...',
    thinking:
      schemeStage === 'ask_eligibility'
        ? 'Checking your eligibility & preparing scheme details...'
        : 'Finding schemes & eligibility...',
    speaking:
      speakingMessageId === 'initial-greeting' ? GREETING_TEXT : 'Speaking...',
  }[agentStatus];

  const isEligibilityOverlayActive =
    hasSchemes && schemeStage === 'ask_eligibility' && eligibilityQuestions.length > 0;

  return (
    <div className="min-h-screen h-screen bg-[#FCFCFD] text-neutral-900 flex flex-col relative overflow-hidden font-sans">
      {/* Minimalist top bar */}
      <header className="relative z-50 w-full bg-[#FCFCFD]/95 backdrop-blur-sm shrink-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between">
        {/* Left circular menu button */}
        <button
          type="button"
          onClick={() => {
            setMenuOpen((prev) => !prev);
            setSettingsOpen(false);
          }}
          aria-label="Open navigation menu"
          className="w-11 h-11 rounded-full bg-white border border-black/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.05)] flex items-center justify-center text-neutral-800 hover:bg-neutral-50 active:scale-95 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9h15M4.5 15h9" />
          </svg>
        </button>

        {/* Right circular voice toggle + settings controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              unlockSharedAudioContext();
              setAutoSpeak((prev) => {
                const next = !prev;
                if (!next) stopAudioPlayback();
                return next;
              });
            }}
            aria-label={autoSpeak ? 'Mute spoken answers' : 'Enable spoken answers'}
            title={autoSpeak ? 'Voice replies ON (click to mute)' : 'Voice replies muted (click to enable)'}
            className={`w-11 h-11 rounded-full border shadow-[0_2px_10px_rgba(0,0,0,0.05)] flex items-center justify-center active:scale-95 transition ${
              autoSpeak
                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB] hover:bg-[#DBEAFE]'
                : 'bg-white border-black/[0.06] text-neutral-400 hover:bg-neutral-50'
            }`}
          >
            {autoSpeak ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsOpen((prev) => !prev);
              setMenuOpen(false);
            }}
            aria-label="Voice and agent settings"
            className="w-11 h-11 rounded-full bg-white border border-black/[0.06] shadow-[0_2px_10px_rgba(0,0,0,0.05)] flex items-center justify-center text-neutral-800 hover:bg-neutral-50 active:scale-95 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              />
            </svg>
          </button>
        </div>
        </div>
      </header>

      {/* Left Slide-Over Menu Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative z-50 w-72 max-w-[82vw] bg-white h-full shadow-2xl border-r border-black/10 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-black/5">
                <span className="font-display font-bold text-lg text-neutral-900">Govt Compass</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-1.5">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:opacity-90 transition flex items-center justify-between"
                >
                  <span>New Session</span>
                  <span>+</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/questionnaire');
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-neutral-100 text-sm font-medium text-neutral-800 transition"
                >
                  Guided Questionnaire
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/schemes');
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-neutral-100 text-sm font-medium text-neutral-800 transition"
                >
                  Explore All Schemes
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-neutral-100 text-sm font-medium text-neutral-800 transition"
                >
                  Back to Home
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-black/5">
              <AuthStatusButton />
            </div>
          </aside>
        </div>
      )}

      {/* Right Settings Popover */}
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="fixed top-16 right-4 sm:right-6 z-40 w-72 bg-white rounded-2xl shadow-xl border border-black/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-neutral-900">Voice & Preferences</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="text-xs text-neutral-400 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-neutral-800">Spoken Responses</div>
                <div className="text-[11px] text-neutral-500">Speak answers aloud automatically</div>
              </div>
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => {
                  unlockSharedAudioContext();
                  setAutoSpeak(e.target.checked);
                  if (!e.target.checked) stopAudioPlayback();
                }}
                className="h-4 w-4 rounded accent-[#2563EB]"
              />
            </label>

            <div>
              <div className="text-xs font-semibold text-neutral-800 mb-1.5">Advisor Voice</div>
              <select
                value={selectedVoice}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="w-full text-xs bg-neutral-50 border border-black/10 rounded-xl px-3 py-2 text-neutral-800 focus:outline-none focus:border-[#3B82F6]"
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleTestVoice}
              disabled={testingVoice}
              className="w-full py-2 px-3 rounded-xl bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] text-xs font-semibold hover:bg-[#DBEAFE] transition disabled:opacity-50"
            >
              {testingVoice ? 'Playing greeting...' : 'Test Advisor Voice'}
            </button>

            <div className="pt-3 border-t border-black/5">
              <AuthStatusButton />
            </div>
          </div>
        </>
      )}

      {/* Main Content Stage — Pure Voice Orb + Scheme Eligibility & Application Details Only (Zero User Text Bubbles) */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 pb-28">
        <div className="max-w-4xl mx-auto min-h-full flex flex-col">
          {/* Voice Orb Presence */}
          <div
            className={`flex flex-col items-center justify-center text-center transition-all duration-500 ${
              hasSchemes ? 'pt-2 pb-6' : 'flex-1 py-6'
            }`}
          >
            <SkyCloudOrb
              status={agentStatus}
              compact={hasSchemes}
              voiceLevel={voiceLevel}
              onClick={handleOrbClick}
            />

            <div className="mt-5 flex items-center justify-center gap-2 text-sm sm:text-base font-medium text-neutral-700 max-w-md px-4">
              <VoiceEqualizer active={agentStatus === 'listening' || agentStatus === 'speaking'} />
              <span>{statusLabel}</span>
            </div>

            {agentStatus === 'idle' && !hasSchemes && (
              <p className="mt-2 text-xs text-neutral-400">
                Tap the orb to speak
              </p>
            )}

            {latestSpokenReply && agentStatus !== 'thinking' && agentStatus !== 'transcribing' && (
              <button
                type="button"
                onClick={handleReplayLatest}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-black/10 text-xs font-semibold text-neutral-700 hover:border-[#3B82F6]/50 hover:text-[#2563EB] transition shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
              >
                {agentStatus === 'speaking' ? 'Stop Voice' : 'Replay Voice Answer'}
              </button>
            )}

            {/* Inline Error Notice right under the orb so it is always visible */}
            {error && (
              <div className="mt-4 w-full max-w-xl bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-xs sm:text-sm flex items-start justify-between gap-3 text-left">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-500 hover:text-red-800 font-bold shrink-0"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Stage 1: Matching Schemes Blurred Behind the Interactive Eligibility Form */}
          {hasSchemes && schemeStage === 'ask_eligibility' && (
            <section
              className={`space-y-5 pb-8 transition-all duration-300 ${
                isEligibilityOverlayActive
                  ? 'blur-[6px] opacity-60 pointer-events-none select-none'
                  : 'animate-fade-in-up'
              }`}
              aria-hidden={isEligibilityOverlayActive}
            >
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500">
                  Step 1 · Matching Schemes Found ({matchedSchemes.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchedSchemes.map((scheme) => (
                  <SchemeOverviewCard
                    key={scheme._id}
                    scheme={scheme}
                    onProceedSingle={handleProceedSingleScheme}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Stage 2: Proceed With Full Scheme Details & Displayed Eligibility Criteria */}
          {hasSchemes && schemeStage !== 'ask_eligibility' && (
            <section className="space-y-4 pb-8 animate-fade-in-up">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500">
                  Scheme Details, Eligibility Criteria & How to Apply (
                  {focusedSchemeId
                    ? 1
                    : matchedSchemes.length}
                  )
                </h2>

                <div className="flex items-center gap-3">
                  {focusedSchemeId && matchedSchemes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFocusedSchemeId(null)}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      Show All ({matchedSchemes.length})
                    </button>
                  )}
                  {eligibilityQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFocusedSchemeId(null);
                        setSchemeStage('ask_eligibility');
                      }}
                      className="text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                    >
                      ← Back to Eligibility Check
                    </button>
                  )}
                </div>
              </div>

              {(focusedSchemeId
                ? matchedSchemes.filter((s) => s._id === focusedSchemeId)
                : matchedSchemes
              ).map((scheme) => (
                <SchemeDetailCard
                  key={scheme._id}
                  scheme={scheme}
                  onOpenFull={(selected) =>
                    navigate(`/scheme/${selected._id}`, { state: { scheme: selected } })
                  }
                />
              ))}

              {liveSources.length > 0 && (
                <div className="bg-white border border-black/10 rounded-2xl p-4 sm:p-5 space-y-2.5">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">
                    Verified Official Web Sources
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {liveSources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8FAFF] border border-[#DBEAFE] text-xs font-medium text-[#2563EB] hover:bg-[#EFF6FF] transition"
                      >
                        <span className="truncate max-w-[240px]">{src.title}</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Centered Eligibility Form Modal Overlay (shown over blurred schemes during eligibility check) */}
      {isEligibilityOverlayActive && (
        <EligibilityFormModal
          schemeCount={matchedSchemes.length}
          questions={eligibilityQuestions}
          answers={eligibilityAnswers}
          extraNote={eligibilityExtraNote}
          onExtraNoteChange={setEligibilityExtraNote}
          onSelectAnswer={handleSelectEligibilityAnswer}
          onSubmit={handleSubmitEligibilityAnswers}
          onSkipToDetails={handleSkipToAllDetails}
          agentStatus={agentStatus}
          onVoiceTap={handleOrbClick}
          disabled={agentStatus === 'thinking' || agentStatus === 'transcribing'}
        />
      )}

      {/* Bottom Floating Bar — Clean Centered Black Cross ('✕') Button Only */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#FCFCFD] via-[#FCFCFD]/90 to-transparent pt-4 pb-6 px-4 flex items-center justify-center pointer-events-none">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close AI assistant"
          className="pointer-events-auto w-14 h-14 rounded-full bg-[#111111] text-white flex items-center justify-center shadow-[0_6px_22px_rgba(0,0,0,0.2)] hover:bg-neutral-800 active:scale-95 transition"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function AgentPage() {
  return (
    <AuthGate
      title="Sign in to GovtCompass AI"
      subtitle="Sign in with your Google account to talk with our voice scheme advisor and hear personalized government scheme answers."
    >
      <AgentWorkspace />
    </AuthGate>
  );
}
