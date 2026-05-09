import express from 'express';
import axios from 'axios';

const router = express.Router();

// Step 1: Redirect to Twitch
router.get('/twitch', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: process.env.TWITCH_REDIRECT_URI,
    response_type: 'code',
    scope: 'user:read:email',
    state: Math.random().toString(36).substring(7),
  });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
});

// Step 2: Twitch callback
router.get('/twitch/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TWITCH_REDIRECT_URI,
      },
    });

    const { access_token } = tokenRes.data;

    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID,
      },
    });

    const user = userRes.data.data[0];
    const twitchUser = {
      id: user.id,
      login: user.login,
      display_name: user.display_name,
      profile_image_url: user.profile_image_url,
    };

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const params = new URLSearchParams(twitchUser);
    res.redirect(`${frontendUrl}/auth/callback?${params}`);
  } catch (err) {
    console.error('Twitch auth error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/?error=auth`);
  }
});

export default router;
