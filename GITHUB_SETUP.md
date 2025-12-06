# Пошаговая инструкция: Загрузка проекта на GitHub

## ✅ Шаг 1: Создайте репозиторий на GitHub

1. Зайдите на [github.com](https://github.com) и войдите в аккаунт
2. Нажмите зеленую кнопку **"New"** (или **"+"** в правом верхнем углу → **"New repository"**)
3. Заполните форму:
   - **Repository name**: `discord-clone` (или любое другое имя)
   - **Description**: `Discord clone with voice and text chat` (опционально)
   - Выберите **Public** (публичный) или **Private** (приватный)
   - ⚠️ **НЕ** ставьте галочки на:
     - ❌ Add a README file
     - ❌ Add .gitignore
     - ❌ Choose a license
   - (У вас уже есть эти файлы!)
4. Нажмите **"Create repository"**

## ✅ Шаг 2: Скопируйте URL репозитория

После создания репозитория GitHub покажет страницу с инструкциями. Найдите зеленую кнопку **"Code"** и скопируйте URL. Он будет выглядеть так:
```
https://github.com/ВАШ_USERNAME/discord-clone.git
```

## ✅ Шаг 3: Выполните команды в терминале

Откройте PowerShell или командную строку в папке проекта и выполните:

### Команда 1: Добавление удаленного репозитория
```bash
git remote add origin https://github.com/ВАШ_USERNAME/discord-clone.git
```
**⚠️ ВАЖНО**: Замените `ВАШ_USERNAME` и `discord-clone` на ваши реальные значения!

### Команда 2: Загрузка кода на GitHub
```bash
git push -u origin main
```

Если GitHub попросит авторизацию:
- Введите ваш **username** (имя пользователя GitHub)
- Введите ваш **Personal Access Token** (не пароль!)

## 🔑 Как создать Personal Access Token (если нужно)

Если GitHub просит токен вместо пароля:

1. Зайдите на GitHub.com
2. Нажмите на ваш аватар (правый верхний угол) → **Settings**
3. В левом меню выберите **Developer settings**
4. Выберите **Personal access tokens** → **Tokens (classic)**
5. Нажмите **Generate new token** → **Generate new token (classic)**
6. Заполните:
   - **Note**: `Discord Clone Deploy`
   - **Expiration**: выберите срок действия
   - Отметьте галочку **repo** (полный доступ к репозиториям)
7. Нажмите **Generate token**
8. **Скопируйте токен** (он показывается только один раз!)
9. Используйте этот токен вместо пароля при `git push`

## ✅ Шаг 4: Проверка

После успешной загрузки:
1. Обновите страницу репозитория на GitHub
2. Вы должны увидеть все ваши файлы
3. Готово! Теперь можно деплоить на Render.com

## 🚀 Следующий шаг: Деплой на Render.com

После загрузки на GitHub:
1. Зайдите на [render.com](https://render.com)
2. Нажмите **"New +"** → **"Web Service"**
3. Подключите ваш GitHub репозиторий
4. Следуйте инструкциям из `DEPLOY.md`

## ❓ Решение проблем

### Ошибка: "remote origin already exists"
```bash
git remote remove origin
git remote add origin https://github.com/ВАШ_USERNAME/discord-clone.git
```

### Ошибка: "failed to push some refs"
```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### Ошибка авторизации
- Убедитесь, что используете Personal Access Token, а не пароль
- Проверьте, что токен имеет права **repo**

