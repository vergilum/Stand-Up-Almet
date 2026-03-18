(function () {
  class AuthManager {
    constructor() {
      const config = window.SUPABASE_CONFIG || {};

      if (!window.supabase?.createClient) {
        throw new Error('Supabase client library is not loaded.');
      }

      if (!config.url || !config.key) {
        throw new Error('Supabase is not configured. Check window.SUPABASE_CONFIG.');
      }

      this.supabase = window.supabase.createClient(config.url, config.key);
      this.currentUser = null;
      this.authInitialized = false;
    }

    async init() {
      if (this.authInitialized) {
        return;
      }

      this.bindForms();

      const {
        data: { session },
        error
      } = await this.supabase.auth.getSession();

      if (error) {
        this.showMessage('Не удалось проверить сессию. Попробуйте обновить страницу.', 'error');
        console.error('Session error:', error);
      }

      await this.applySession(session);

      this.supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        await this.applySession(nextSession);
      });

      this.authInitialized = true;
    }

    bindForms() {
      const loginForm = document.getElementById('login-form');
      const registerForm = document.getElementById('register-form');

      loginForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        this.clearMessage();

        const email = document.getElementById('login-email')?.value.trim() || '';
        const password = document.getElementById('login-password')?.value || '';

        const result = await this.handleLogin(email, password);
        if (!result.success) {
          this.showMessage(result.error, 'error');
        }
      });

      registerForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        this.clearMessage();

        const email = document.getElementById('register-email')?.value.trim() || '';
        const password = document.getElementById('register-password')?.value || '';
        const fullName = document.getElementById('register-fullname')?.value.trim() || '';
        const phone = document.getElementById('register-phone')?.value.trim() || '';

        const result = await this.handleRegister(email, password, fullName, phone);
        if (!result.success) {
          this.showMessage(result.error, 'error');
        }
      });
    }

    async applySession(session) {
      this.currentUser = session?.user ?? null;

      if (this.currentUser) {
        await this.ensureProfile();
      }

      this.updateAuthUI(Boolean(this.currentUser));
    }

    showAuthModal(type) {
      const modal = document.getElementById('auth-modal');
      const modalTitle = document.getElementById('auth-modal-title');
      const loginForm = document.getElementById('login-form');
      const registerForm = document.getElementById('register-form');

      if (!modal || !modalTitle || !loginForm || !registerForm) {
        return;
      }

      this.clearMessage();
      modalTitle.textContent = type === 'register' ? 'Регистрация' : 'Вход';
      loginForm.style.display = type === 'register' ? 'none' : 'flex';
      registerForm.style.display = type === 'register' ? 'flex' : 'none';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }

    hideAuthModal() {
      const modal = document.getElementById('auth-modal');
      if (!modal) {
        return;
      }

      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }

    async handleLogin(email, password) {
      try {
        const { error } = await this.supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          throw error;
        }

        this.hideAuthModal();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error.message || 'Не удалось выполнить вход.'
        };
      }
    }

    async handleRegister(email, password, fullName, phone) {
      try {
        const { data, error } = await this.supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone
            }
          }
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          await this.ensureProfile();
          this.hideAuthModal();
          return { success: true };
        }

        this.showAuthModal('login');
        this.showMessage(
          'Аккаунт создан. Если в проекте включено подтверждение почты, подтвердите email и затем выполните вход.',
          'success'
        );

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error.message || 'Не удалось выполнить регистрацию.'
        };
      }
    }

    async ensureProfile() {
      if (!this.currentUser) {
        return;
      }

      const metadata = this.currentUser.user_metadata || {};
      const { error } = await this.supabase
        .from('profiles')
        .upsert(
          {
            id: this.currentUser.id,
            full_name: metadata.full_name || null,
            phone: metadata.phone || null
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.error('Profile upsert error:', error);
      }
    }

    async handleLogout() {
      const { error } = await this.supabase.auth.signOut();

      if (error) {
        console.error('Logout error:', error);
        return false;
      }

      document.getElementById('profile-modal')?.classList.remove('is-open');
      return true;
    }

    updateAuthUI(isAuthenticated) {
      const loginBtn = document.getElementById('login-btn');
      const profileBtn = document.getElementById('profile-btn');
      const userGreeting = document.getElementById('user-greeting');

      if (isAuthenticated && this.currentUser) {
        const fullName = this.currentUser.user_metadata?.full_name?.trim();
        const greetingName = fullName || this.currentUser.email;

        if (loginBtn) {
          loginBtn.style.display = 'none';
        }

        if (profileBtn) {
          profileBtn.style.display = 'inline-flex';
        }

        if (userGreeting) {
          userGreeting.style.display = 'inline-flex';
          userGreeting.textContent = `Привет, ${greetingName}`;
        }
      } else {
        if (loginBtn) {
          loginBtn.style.display = 'inline-flex';
        }

        if (profileBtn) {
          profileBtn.style.display = 'none';
        }

        if (userGreeting) {
          userGreeting.style.display = 'none';
          userGreeting.textContent = '';
        }
      }
    }

    showMessage(text, type) {
      const box = document.getElementById('auth-message');
      if (!box) {
        return;
      }

      box.textContent = text;
      box.className = `auth-message ${type}`;
      box.style.display = 'block';
    }

    clearMessage() {
      const box = document.getElementById('auth-message');
      if (!box) {
        return;
      }

      box.textContent = '';
      box.className = 'auth-message';
      box.style.display = 'none';
    }

    getCurrentUser() {
      return this.currentUser;
    }

    syncCurrentUserMetadata(updates) {
      if (!this.currentUser) {
        return;
      }

      this.currentUser.user_metadata = {
        ...(this.currentUser.user_metadata || {}),
        ...updates
      };

      this.updateAuthUI(true);
    }

    isAuthenticated() {
      return Boolean(this.currentUser);
    }
  }

  window.authManager = new AuthManager();
})();
