const ContactForm = (() => {
  const ENDPOINT = '/api/contact';
  const MAX_MESSAGE_LENGTH = 500;

  // --- DOM REFERENCES ---
  const form = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const messageField = document.getElementById('message');
  const charCount = document.getElementById('charCount');
  const consentCheckbox = document.getElementById('consentCheckbox');

  // --- CHARACTER COUNTER ---
  const updateCharCount = () => {
    const count = messageField.value.length;
    charCount.textContent = count;
    charCount.style.color = count >= MAX_MESSAGE_LENGTH ? '#e74c3c' : '#888';
  };

  // --- VALIDATION ---
  const validateForm = (data) => {
    const errors = [];

    if (!data.fullName || data.fullName.trim().length < 2) {
      errors.push('Please enter your full name.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      errors.push('Please enter a valid email address.');
    }

    if (!data.enquiryType) {
      errors.push('Please select an enquiry type.');
    }

    if (!data.message || data.message.trim().length < 10) {
      errors.push('Please enter a message (minimum 10 characters).');
    }

    if (!data.consent) {
      errors.push('Please confirm your consent before submitting.');
    }

    return errors;
  };

  // --- COLLECT FORM DATA ---
  const getFormData = () => ({
    fullName: document.getElementById('fullName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    enquiryType: document.getElementById('enquiryType').value,
    message: messageField.value.trim(),
    consent: consentCheckbox.checked,
    submittedAt: new Date().toISOString(),
  });

  // --- SUBMIT TO API ---
  const submitForm = async (data) => {
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

  // --- RESET UI STATE ---
  const resetState = () => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message';
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
    submitBtn.textContent = 'Sending...';

    try {
      await submitForm(data);
      form.reset();
      charCount.textContent = '0';
      successMsg.style.display = 'block';
    } catch (err) {
      console.error('Contact form error:', err.message);
      errorMsg.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }
  };

  // --- INIT ---
  const init = () => {
    form.addEventListener('submit', handleSubmit);
    messageField.addEventListener('input', updateCharCount);
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', ContactForm.init);
