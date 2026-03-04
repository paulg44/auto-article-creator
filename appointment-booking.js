const AppointmentBooking = (() => {
  const ENDPOINT = '/api/appointments/request';

  // --- DOM REFERENCES ---
  const form = document.getElementById('appointmentForm');
  const submitBtn = document.getElementById('submitBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const timeSlotsContainer = document.getElementById('timeSlots');
  const preferredDateInput = document.getElementById('preferredDate');
  const clinicSelect = document.getElementById('clinic');

  let selectedTimeSlot = null;

  // --- SET MIN DATE TO TODAY ---
  const setMinDate = () => {
    const today = new Date().toISOString().split('T')[0];
    preferredDateInput.setAttribute('min', today);

    // Also set max date of birth (must be at least 1 year old)
    const maxDob = new Date();
    maxDob.setFullYear(maxDob.getFullYear() - 1);
    document.getElementById('dateOfBirth').setAttribute('max', maxDob.toISOString().split('T')[0]);
  };

  // --- TIME SLOT SELECTION ---
  const handleTimeSlotClick = (e) => {
    const slot = e.target.closest('.time-slot');
    if (!slot || slot.disabled) return;

    // Deselect all
    document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));

    // Select clicked
    slot.classList.add('selected');
    selectedTimeSlot = slot.dataset.time;
  };

  // --- RELOAD TIME SLOTS WHEN DATE OR CLINIC CHANGES ---
  const refreshTimeSlots = async () => {
    const date = preferredDateInput.value;
    const clinic = clinicSelect.value;

    if (!date || !clinic) return;

    try {
      const response = await fetch(`/api/appointments/availability?clinic=${clinic}&date=${date}`);
      if (!response.ok) throw new Error('Failed to fetch availability');

      const { slots } = await response.json();

      // Reset selection
      selectedTimeSlot = null;

      // Re-render slots
      timeSlotsContainer.innerHTML = slots.map(slot => `
        <button
          type="button"
          class="time-slot ${slot.available ? '' : 'unavailable'}"
          data-time="${slot.time}"
          ${slot.available ? '' : 'disabled'}
        >
          ${slot.time}
        </button>
      `).join('');

    } catch (err) {
      console.warn('Could not load availability, showing default slots:', err.message);
    }
  };

  // --- VALIDATION ---
  const validateForm = (data) => {
    const errors = [];

    if (!data.fullName || data.fullName.trim().length < 2) {
      errors.push('Please enter your full name.');
    }

    if (!data.dateOfBirth) {
      errors.push('Please enter your date of birth.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      errors.push('Please enter a valid email address.');
    }

    if (!data.phone || data.phone.trim().length < 10) {
      errors.push('Please enter a valid phone number.');
    }

    if (!data.clinic) {
      errors.push('Please select a clinic.');
    }

    if (!data.appointmentType) {
      errors.push('Please select an appointment type.');
    }

    if (!data.preferredDate) {
      errors.push('Please select a preferred date.');
    }

    if (!selectedTimeSlot) {
      errors.push('Please select an available time slot.');
    }

    if (!data.consent) {
      errors.push('Please confirm your consent before submitting.');
    }

    return errors;
  };

  // --- COLLECT FORM DATA ---
  const getFormData = () => ({
    fullName: document.getElementById('fullName').value.trim(),
    dateOfBirth: document.getElementById('dateOfBirth').value,
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    clinic: clinicSelect.value,
    appointmentType: document.getElementById('appointmentType').value,
    preferredDate: preferredDateInput.value,
    preferredTime: selectedTimeSlot,
    notes: document.getElementById('notes').value.trim(),
    newPatient: document.getElementById('newPatient').checked,
    consent: document.getElementById('consentCheckbox').checked,
    submittedAt: new Date().toISOString(),
  });

  // --- SUBMIT ---
  const submitBooking = async (data) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    return response.json();
  };

  // --- RESET UI ---
  const resetState = () => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request Appointment';
    successMsg.style.display = 'none';
    errorMsg.style.display = 'none';
  };

  // --- HANDLE SUBMIT ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    resetState();

    const data = getFormData();
    const errors = validateForm(data);

    if (errors.length > 0) {
      errorMsg.textContent = errors[0];
      errorMsg.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      await submitBooking(data);
      form.reset();
      selectedTimeSlot = null;
      document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
      successMsg.style.display = 'block';
    } catch (err) {
      console.error('Appointment booking error:', err.message);
      errorMsg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Appointment';
    }
  };

  // --- INIT ---
  const init = () => {
    setMinDate();
    form.addEventListener('submit', handleSubmit);
    timeSlotsContainer.addEventListener('click', handleTimeSlotClick);
    preferredDateInput.addEventListener('change', refreshTimeSlots);
    clinicSelect.addEventListener('change', refreshTimeSlots);
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', AppointmentBooking.init);

const recentAppointments = [
  { date: '2026-02-14', type: 'Hearing Test', clinic: 'Manchester Central' },
  { date: '2026-01-10', type: 'Hearing Aid Fitting', clinic: 'Leeds North' },
  { date: '2025-12-05', type: 'Follow-up Consultation', clinic: 'Liverpool South' },
];

const renderRecentAppointments = () => {
  const container = document.createElement('div');
  container.id = 'recentAppointments';
  container.innerHTML = `
    <h3>Your Recent Appointments</h3>
    ${recentAppointments.map(a => `
      <div class="recent-item">
        <span>${a.date}</span>
        <span>${a.type}</span>
        <span>${a.clinic}</span>
      </div>
    `).join('')}
  `;
  document.body.appendChild(container);
};

renderRecentAppointments();
