(function () {
  class ProfileManager {
    constructor() {
      this.supabase = window.authManager.supabase;
      this.currentUser = null;
    }

    async loadUserProfile() {
      this.currentUser = window.authManager.getCurrentUser();

      if (!this.currentUser) {
        return null;
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', this.currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('Profile load error:', error);
        return null;
      }

      if (data) {
        return data;
      }

      await window.authManager.ensureProfile();

      const { data: retryData, error: retryError } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', this.currentUser.id)
        .maybeSingle();

      if (retryError) {
        console.error('Profile reload error:', retryError);
        return null;
      }

      return retryData;
    }

    async updateProfile(fullName, phone) {
      if (!this.currentUser) {
        throw new Error('Пользователь не авторизован.');
      }

      const { error } = await this.supabase
        .from('profiles')
        .upsert(
          {
            id: this.currentUser.id,
            full_name: fullName || null,
            phone: phone || null
          },
          { onConflict: 'id' }
        );

      if (error) {
        throw error;
      }

      return true;
    }

    async loadUserBookings() {
      if (!this.currentUser) {
        return [];
      }

      const { data, error } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Bookings load error:', error);
        return [];
      }

      return data || [];
    }

    async createBooking(showType, showDate, ticketCount) {
      if (!this.currentUser) {
        throw new Error('Пользователь не авторизован.');
      }

      const { data, error } = await this.supabase
        .from('bookings')
        .insert({
          user_id: this.currentUser.id,
          show_type: showType,
          show_date: showDate,
          ticket_count: ticketCount,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    }

    async cancelBooking(bookingId) {
      const { error } = await this.supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('user_id', this.currentUser.id);

      if (error) {
        throw error;
      }

      await this.loadAndRenderAll();
      return true;
    }

    renderProfile(profile) {
      const profileContainer = document.getElementById('profile-container');

      if (!profileContainer || !this.currentUser) {
        return;
      }

      profileContainer.innerHTML = `
        <div class="profile-card">
          <h3>Личный профиль</h3>
          <div class="profile-info">
            <div class="info-item">
              <label>Электронная почта</label>
              <span>${this.currentUser.email || 'Не указана'}</span>
            </div>
            <div class="info-item">
              <label for="profile-fullname">Полное имя</label>
              <input type="text" id="profile-fullname" value="${profile?.full_name || ''}" />
            </div>
            <div class="info-item">
              <label for="profile-phone">Телефон</label>
              <input type="tel" id="profile-phone" value="${profile?.phone || ''}" />
            </div>
          </div>
          <div id="profile-message" class="auth-message" style="display: none;"></div>
          <div class="profile-actions">
            <button id="save-profile-btn" class="btn-primary" type="button">Сохранить</button>
            <button id="logout-btn" class="btn-secondary" type="button">Выйти</button>
          </div>
        </div>
      `;

      document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
        const fullName = document.getElementById('profile-fullname')?.value.trim() || '';
        const phone = document.getElementById('profile-phone')?.value.trim() || '';

        try {
          await this.updateProfile(fullName, phone);
          window.authManager.syncCurrentUserMetadata({
            full_name: fullName,
            phone
          });
          this.showProfileMessage('Профиль сохранен.', 'success');
        } catch (error) {
          this.showProfileMessage(error.message || 'Не удалось сохранить профиль.', 'error');
        }
      });

      document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const loggedOut = await window.authManager.handleLogout();

        if (loggedOut) {
          profileContainer.innerHTML = '';
          document.getElementById('booking-form-container').innerHTML = '';
          document.getElementById('bookings-container').innerHTML = '';
        }
      });
    }

    renderBookingsList(bookings) {
      const bookingsContainer = document.getElementById('bookings-container');

      if (!bookingsContainer) {
        return;
      }

      if (!bookings.length) {
        bookingsContainer.innerHTML = '<p class="empty-state">У вас пока нет бронирований.</p>';
        return;
      }

      bookingsContainer.innerHTML = `
        <h3>Мои бронирования</h3>
        <div class="bookings-list">
          ${bookings
            .map(
              (booking) => `
                <div class="booking-item">
                  <div class="booking-info">
                    <span class="booking-type">${this.getShowTypeLabel(booking.show_type)}</span>
                    <span class="booking-date">${new Date(booking.show_date).toLocaleDateString('ru-RU')}</span>
                    <span class="booking-tickets">${booking.ticket_count} билет(ов)</span>
                    <span class="booking-status ${booking.status}">${this.getStatusLabel(booking.status)}</span>
                  </div>
                  <div class="booking-actions">
                    ${
                      booking.status === 'pending'
                        ? `<button class="btn-cancel" type="button" data-booking-id="${booking.id}">Отменить</button>`
                        : ''
                    }
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      `;

      bookingsContainer.querySelectorAll('[data-booking-id]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await this.cancelBooking(button.dataset.bookingId);
          } catch (error) {
            alert(error.message || 'Не удалось отменить бронирование.');
          }
        });
      });
    }

    renderBookingForm() {
      const bookingFormContainer = document.getElementById('booking-form-container');

      if (!bookingFormContainer) {
        return;
      }

      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 1);

      bookingFormContainer.innerHTML = `
        <div class="booking-form">
          <h3>Забронировать билет</h3>
          <form id="booking-form">
            <div class="form-group">
              <label for="show-type">Тип шоу</label>
              <select id="show-type" required>
                <option value="">Выберите шоу</option>
                <option value="open_mic">Открытый микрофон</option>
                <option value="best">Стендап Лучшее</option>
                <option value="big">Большой стендап</option>
              </select>
            </div>
            <div class="form-group">
              <label for="show-date">Дата шоу</label>
              <input type="date" id="show-date" min="${minDate.toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
              <label for="ticket-count">Количество билетов</label>
              <input type="number" id="ticket-count" min="1" max="10" value="1" required>
            </div>
            <button type="submit" class="btn-primary">Забронировать</button>
          </form>
        </div>
      `;

      document.getElementById('booking-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const showType = document.getElementById('show-type')?.value || '';
        const showDate = document.getElementById('show-date')?.value || '';
        const ticketCount = Number.parseInt(document.getElementById('ticket-count')?.value || '1', 10);

        try {
          await this.createBooking(showType, showDate, ticketCount);
          await this.loadAndRenderAll();
        } catch (error) {
          alert(error.message || 'Не удалось создать бронирование.');
        }
      });
    }

    async loadAndRenderAll() {
      this.currentUser = window.authManager.getCurrentUser();

      if (!this.currentUser) {
        return;
      }

      const [profile, bookings] = await Promise.all([
        this.loadUserProfile(),
        this.loadUserBookings()
      ]);

      this.renderProfile(profile);
      this.renderBookingForm();
      this.renderBookingsList(bookings);
    }

    showProfileMessage(text, type) {
      const box = document.getElementById('profile-message');
      if (!box) {
        return;
      }

      box.textContent = text;
      box.className = `auth-message ${type}`;
      box.style.display = 'block';
    }

    getShowTypeLabel(type) {
      const labels = {
        open_mic: 'Открытый микрофон',
        best: 'Стендап Лучшее',
        big: 'Большой стендап'
      };

      return labels[type] || type;
    }

    getStatusLabel(status) {
      const labels = {
        pending: 'Ожидает подтверждения',
        confirmed: 'Подтверждено',
        cancelled: 'Отменено'
      };

      return labels[status] || status;
    }
  }

  window.profileManager = new ProfileManager();
})();
