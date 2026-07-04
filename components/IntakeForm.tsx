import React, { useEffect, useState } from "react";
import { Customer, Dog } from "../types";
import { INTAKE_TERMS, INTAKE_TERMS_VERSION, MATTING_INTRO, MATTING_TERMS, MATTING_BULLETS, MATTING_CLOSING } from "../constants";
import { loadIntakeForm, submitIntakeForm, submitMattingConsent } from "../services/customerService";
import SignatureCanvas from "./SignatureCanvas";

interface IntakeFormProps {
  token: string;
}

// has_medication is UI-only (drives the Yes/No toggle); the server stores medication_details
type FormDog = Dog & { has_medication?: boolean | null };

const emptyDog = (): FormDog => ({
  name: "",
  breed: "",
  dob: "",
  sex: null,
  neutered: null,
  vaccinated: null,
  behaviour_notes: "",
  health_conditions: "",
  needs_prescribed_shampoo: null,
  medication_details: "",
  needs_muzzle: null,
  has_medication: null,
});

const inputClass = "w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium bg-white";
const labelClass = "block text-sm font-bold text-slate-700 mb-1";

const YesNo: React.FC<{ label: string; value: boolean | null | undefined; onChange: (value: boolean) => void }> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <span className="text-sm font-bold text-slate-700">{label}</span>
    <div className="flex gap-2 shrink-0">
      <button type="button" onClick={() => onChange(true)} className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${value === true ? "bg-emerald-600 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
        Yes
      </button>
      <button type="button" onClick={() => onChange(false)} className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${value === false ? "bg-slate-700 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
        No
      </button>
    </div>
  </div>
);

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
    <div className="bg-emerald-600 px-6 py-3">
      <h2 className="text-white font-black uppercase tracking-wide text-sm">{title}</h2>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const MattingPolicy: React.FC = () => (
  <div className="text-sm text-slate-600 leading-relaxed space-y-3">
    <p className="italic text-slate-500">{MATTING_INTRO}</p>
    {MATTING_TERMS.map((paragraph, i) => (
      <p key={i}>{paragraph}</p>
    ))}
    <ul className="list-disc list-inside space-y-2 pl-2">
      {MATTING_BULLETS.map((bullet, i) => (
        <li key={i}>{bullet}</li>
      ))}
    </ul>
    <p className="font-bold text-slate-700">{MATTING_CLOSING}</p>
  </div>
);

const IntakeForm: React.FC<IntakeFormProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [customer, setCustomer] = useState<Partial<Customer>>({});
  const [dogs, setDogs] = useState<FormDog[]>([emptyDog()]);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mattingRequired, setMattingRequired] = useState(false);
  const [mattingAlreadySigned, setMattingAlreadySigned] = useState(false);
  const [mattingAgreed, setMattingAgreed] = useState(false);
  const [mattingOnlyMode, setMattingOnlyMode] = useState(false);

  useEffect(() => {
    loadIntakeForm(token)
      .then(({ customer: prefill, dogs: existingDogs, alreadyCompleted: completed, mattingRequired: needsMatting, mattingAlreadySigned: mattingSigned }) => {
        setCustomer(prefill);
        if (existingDogs.length > 0) {
          setDogs(existingDogs.map((dog) => ({ ...emptyDog(), ...dog, has_medication: (dog.medication_details || "").trim() ? true : null })));
        }
        setAlreadyCompleted(completed);
        setMattingRequired(needsMatting);
        setMattingAlreadySigned(mattingSigned);
        // Agreement already signed and only the matting release outstanding: show the short flow
        setMattingOnlyMode(completed && needsMatting && !mattingSigned);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const setField = (field: keyof Customer, value: unknown) => setCustomer((prev) => ({ ...prev, [field]: value }));
  const setDogField = (index: number, field: keyof FormDog, value: unknown) =>
    setDogs((prev) => prev.map((dog, i) => (i === index ? { ...dog, [field]: value } : dog)));

  const showMattingSection = mattingRequired && !mattingAlreadySigned;

  const handleSubmit = async () => {
    setSubmitError(null);
    const validDogs = dogs.filter((dog) => (dog.name || "").trim());

    if (!(customer.ownername || "").trim()) return setSubmitError("Please enter your name.");
    if (!(customer.phone || "").trim()) return setSubmitError("Please enter your phone number.");
    if (validDogs.length === 0) return setSubmitError("Please add at least one dog (name is required).");
    if (!agreed) return setSubmitError("Please tick the box to confirm you agree to our terms and conditions.");
    if (showMattingSection && !mattingAgreed) return setSubmitError("Please tick the box in the Matting Release section to confirm you have read and understood it.");
    if (!signature) return setSubmitError("Please sign in the signature box.");

    setSubmitting(true);
    try {
      await submitIntakeForm(token, customer, validDogs, signature, INTAKE_TERMS_VERSION, showMattingSection && mattingAgreed);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMattingSubmit = async () => {
    setSubmitError(null);
    if (!mattingAgreed) return setSubmitError("Please tick the box to confirm you have read and understood the matting release.");
    if (!signature) return setSubmitError("Please sign in the signature box.");
    setSubmitting(true);
    try {
      await submitMattingConsent(token, signature);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-32 text-center px-4">
        <div className="text-5xl mb-6 animate-bounce">🐾</div>
        <p className="text-slate-500 font-bold">Loading your form...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto py-32 text-center px-4">
        <div className="text-5xl mb-6">😕</div>
        <h1 className="text-2xl font-black mb-4 text-slate-800">Link Not Valid</h1>
        <p className="text-slate-500">{loadError}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto py-32 text-center px-4 animate-fade-in">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 text-5xl">✅</div>
        <h1 className="text-4xl font-black mb-4 tracking-tight uppercase">All Done!</h1>
        <p className="text-slate-500 text-xl leading-relaxed">
          Thank you{customer.ownername ? `, ${String(customer.ownername).split(" ")[0]}` : ""}! {mattingOnlyMode ? "Your matting release consent has been received." : "Your grooming agreement has been received."} We look forward to seeing {dogs[0]?.name || "your dog"} soon! 🐾
        </p>
      </div>
    );
  }

  if (mattingOnlyMode) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 animate-fade-in">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-slate-800 uppercase">Matting Release Consent</h1>
          <p className="text-slate-500 mt-2 font-medium">Maisey Days @ Dirty Dawg · One quick read and a signature</p>
        </div>

        <SectionCard title="Matting release information and consent">
          <MattingPolicy />
        </SectionCard>

        <SectionCard title="Sign & submit">
          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <input type="checkbox" checked={mattingAgreed} onChange={(e) => setMattingAgreed(e.target.checked)} className="w-5 h-5 mt-0.5 accent-emerald-600" />
            <span className="text-sm font-bold text-slate-700">I confirm that I have read and understood the risks and consequences associated with matting and authorise the grooming salon to proceed accordingly.</span>
          </label>
          <SignatureCanvas onChange={setSignature} />
          {submitError && <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold">{submitError}</div>}
          <button type="button" disabled={submitting} onClick={handleMattingSubmit} className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all transform active:scale-95 shadow-xl shadow-emerald-900/20">
            {submitting ? "Sending..." : "Submit Consent"}
          </button>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8 animate-fade-in">
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tight text-slate-800 uppercase">Grooming Agreement</h1>
        <p className="text-slate-500 mt-2 font-medium">Maisey Days @ Dirty Dawg · Takes about 2 minutes</p>
        {alreadyCompleted && <div className="mt-4 inline-block bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-xl text-sm font-bold">You've already completed this form — submitting again will update your details.</div>}
      </div>

      {/* ABOUT YOU */}
      <SectionCard title="A little bit about you">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Owner(s) name *</label>
            <input value={customer.ownername || ""} onChange={(e) => setField("ownername", e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Address</label>
            <input value={customer.address || ""} onChange={(e) => setField("address", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone *</label>
            <input type="tel" value={customer.phone || ""} onChange={(e) => setField("phone", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={customer.email || ""} onChange={(e) => setField("email", e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Where did you hear about us?</label>
            <input value={customer.hear_about_us || ""} onChange={(e) => setField("hear_about_us", e.target.value)} className={inputClass} placeholder="e.g. Facebook, a friend, walking past..." />
          </div>
        </div>
        <div className="mt-4 bg-slate-50 rounded-2xl p-4">
          <p className="text-sm text-slate-600 mb-2">We send a text confirming your appointment and a half-hour alert for when your dog will be finished so you can collect them. If not, we will call you.</p>
          <YesNo label="Are you happy to receive these?" value={customer.sms_ok} onChange={(v) => setField("sms_ok", v)} />
        </div>
        <div className="mt-4">
          <p className="text-sm font-bold text-slate-700 mb-2">Alternative contact (in case we can't reach you)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={customer.alt_contact_name || ""} onChange={(e) => setField("alt_contact_name", e.target.value)} className={inputClass} placeholder="Name" />
            <input type="tel" value={customer.alt_contact_phone || ""} onChange={(e) => setField("alt_contact_phone", e.target.value)} className={inputClass} placeholder="Phone" />
          </div>
        </div>
      </SectionCard>

      {/* ABOUT YOUR DOGS */}
      {dogs.map((dog, index) => (
        <SectionCard key={index} title={dogs.length > 1 ? `A little bit about your dog (${index + 1} of ${dogs.length})` : "A little bit about your dog"}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Dog's name *</label>
              <input value={dog.name} onChange={(e) => setDogField(index, "name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Breed</label>
              <input value={dog.breed || ""} onChange={(e) => setDogField(index, "breed", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Age</label>
              <input value={dog.dob || ""} onChange={(e) => setDogField(index, "dob", e.target.value)} className={inputClass} placeholder="e.g. 3 years old" />
            </div>
            <div>
              <label className={labelClass}>Male or female?</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDogField(index, "sex", "male")} className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${dog.sex === "male" ? "bg-emerald-600 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  Male
                </button>
                <button type="button" onClick={() => setDogField(index, "sex", "female")} className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${dog.sex === "female" ? "bg-emerald-600 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  Female
                </button>
              </div>
            </div>
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            <YesNo label="Neutered / spayed?" value={dog.neutered} onChange={(v) => setDogField(index, "neutered", v)} />
            <YesNo label="Vaccinated?" value={dog.vaccinated} onChange={(v) => setDogField(index, "vaccinated", v)} />
            <YesNo label="Do they require their own prescribed medical shampoo?" value={dog.needs_prescribed_shampoo} onChange={(v) => setDogField(index, "needs_prescribed_shampoo", v)} />
            <YesNo
              label="Do they have any medication?"
              value={dog.has_medication}
              onChange={(v) => {
                setDogField(index, "has_medication", v);
                if (!v) setDogField(index, "medication_details", "");
              }}
            />
            {dog.has_medication === true && (
              <div className="py-3">
                <label className={labelClass}>Please put the name of the medication and what it's needed for</label>
                <input value={dog.medication_details || ""} onChange={(e) => setDogField(index, "medication_details", e.target.value)} className={inputClass} placeholder="e.g. Apoquel — for itchy skin" />
              </div>
            )}
            <YesNo label="Do we need to muzzle?" value={dog.needs_muzzle} onChange={(v) => setDogField(index, "needs_muzzle", v)} />
          </div>
          <div className="grid grid-cols-1 gap-4 mt-4">
            <div>
              <label className={labelClass}>Behaviour notes / triggers</label>
              <textarea rows={2} value={dog.behaviour_notes || ""} onChange={(e) => setDogField(index, "behaviour_notes", e.target.value)} className={inputClass} placeholder="Anything we should know? Nervous of dryers, dislikes paws being touched..." />
            </div>
            <div>
              <label className={labelClass}>Known health / skin conditions</label>
              <textarea rows={2} value={dog.health_conditions || ""} onChange={(e) => setDogField(index, "health_conditions", e.target.value)} className={inputClass} />
            </div>
          </div>
          {dogs.length > 1 && (
            <button type="button" onClick={() => setDogs((prev) => prev.filter((_, i) => i !== index))} className="mt-4 text-sm font-bold text-red-400 hover:text-red-600 underline">
              Remove this dog
            </button>
          )}
        </SectionCard>
      ))}

      <button type="button" onClick={() => setDogs((prev) => [...prev, emptyDog()])} className="w-full py-4 border-2 border-dashed border-emerald-300 text-emerald-600 rounded-2xl font-black hover:bg-emerald-50 transition-all">
        + Add another dog
      </button>

      {/* VET & CONSENTS */}
      <SectionCard title="Your vet & consents">
        <div>
          <label className={labelClass}>Which vets do you use?</label>
          <input value={customer.vet_name || ""} onChange={(e) => setField("vet_name", e.target.value)} className={inputClass} />
        </div>
        <div className="mt-2 divide-y divide-slate-100">
          <YesNo label="Are we allowed to give your dog treats?" value={customer.treats_ok} onChange={(v) => setField("treats_ok", v)} />
          <YesNo label="Can we use photos/videos of your dog for adverts / social media?" value={customer.photo_consent} onChange={(v) => setField("photo_consent", v)} />
        </div>
      </SectionCard>

      {/* TERMS */}
      <SectionCard title="A little bit about us — Terms and Conditions">
        <ol className="space-y-3 max-h-72 overflow-y-auto pr-2 text-sm text-slate-600 leading-relaxed list-decimal list-inside">
          {INTAKE_TERMS.map((term, i) => (
            <li key={i}>{term}</li>
          ))}
        </ol>
      </SectionCard>

      {/* MATTING RELEASE (only when the groomer has flagged it as needed) */}
      {showMattingSection && (
        <SectionCard title="Matting release information and consent">
          <MattingPolicy />
          <label className="flex items-start gap-3 cursor-pointer mt-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <input type="checkbox" checked={mattingAgreed} onChange={(e) => setMattingAgreed(e.target.checked)} className="w-5 h-5 mt-0.5 accent-emerald-600" />
            <span className="text-sm font-bold text-slate-700">I confirm that I have read and understood the risks and consequences associated with matting and authorise the grooming salon to proceed accordingly.</span>
          </label>
        </SectionCard>
      )}

      {/* EMERGENCY CARE */}
      <SectionCard title="Emergency care authorisation">
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">In the event of illness or injury during grooming, I authorise emergency veterinary care for my pet. Please use my preferred vet, but in case of urgency, any qualified veterinarian may be contacted.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Preferred emergency vet</label>
            <input value={customer.emergency_vet_name || ""} onChange={(e) => setField("emergency_vet_name", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Vet phone</label>
            <input type="tel" value={customer.emergency_vet_phone || ""} onChange={(e) => setField("emergency_vet_phone", e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Vet address</label>
            <input value={customer.emergency_vet_address || ""} onChange={(e) => setField("emergency_vet_address", e.target.value)} className={inputClass} />
          </div>
        </div>
      </SectionCard>

      {/* SIGN & SUBMIT */}
      <SectionCard title="Sign & submit">
        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="w-5 h-5 mt-0.5 accent-emerald-600" />
          <span className="text-sm font-bold text-slate-700">I confirm that I have read and agree to the policies of Maisey Days @ Dirty Dawg for my dog, and I authorise emergency veterinary care as described above.</span>
        </label>
        <SignatureCanvas onChange={setSignature} />
        {submitError && <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold">{submitError}</div>}
        <button type="button" disabled={submitting} onClick={handleSubmit} className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all transform active:scale-95 shadow-xl shadow-emerald-900/20">
          {submitting ? "Sending..." : "Submit Agreement"}
        </button>
        <p className="text-xs text-slate-400 text-center mt-3">A copy is available upon request for your records.</p>
      </SectionCard>
    </div>
  );
};

export default IntakeForm;
