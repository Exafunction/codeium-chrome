import React, { useEffect } from 'react';

import {
  Alert,
  Button,
  Link,
  Snackbar,
  TextField,
  Typography,
  IconButton,
  Toolbar,
  Box,
} from '@mui/material';

import { openAuthTab } from '../auth';
import { loggedOut } from '../shared';
import SettingsIcon from '@mui/icons-material/Settings';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SaveAltIcon from '@mui/icons-material/SaveAlt';

import {
  computeAllowlist,
  defaultAllowlist,
  getGeneralProfileUrl,
  getStorageItem,
  setStorageItem,
} from '../storage';

// Function to extract domain and convert it to a regex pattern
function domainToRegex(url: string) {
  const { hostname } = new URL(url);
  // Extract the top-level domain (TLD) and domain name
  const domainParts = hostname.split('.').slice(-2); // This takes the last two parts of the hostname
  const domain = domainParts.join('.');
  // Escape special regex characters (just in case) and create a regex that matches any subdomain or path
  const regexSafeDomain = domain.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  return new RegExp(`https?://(.*\\.)?${regexSafeDomain}(/.*)?`);
}

const getCurrentUrl = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0].url;
};

const addToAllowlist = async (input: string) => {
  try {
    const item = new RegExp(input);
    const allowlist = computeAllowlist(await getStorageItem('allowlist')) || undefined;
    for (const regex of allowlist) {
      const r = new RegExp(regex);
      if (r.source === item.source) {
        return 'Already in the whitelist';
      }
    }
    allowlist.push(input);

    await setStorageItem('allowlist', { defaults: defaultAllowlist, current: allowlist });
    return 'success';
  } catch (e) {
    return (e as Error).message || 'Unknown error';
  }
};

const getAllowlist = async () => (await getStorageItem('allowlist')) || [];

export const PopupPage = () => {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [severity, setSeverity] = React.useState<'success' | 'error'>('success');
  const [user, setUser] = React.useState<any>();
  const [matched, setMatched] = React.useState(false);
  const [regexItem, setRegexItem] = React.useState('');

  const addItem = async () => {
    const result = await addToAllowlist(regexItem);
    if (result === 'success') {
      setSeverity('success');
      setMessage('Added to the whitelist. Please refresh');
    } else {
      setSeverity('error');
      setMessage(result);
    }
    setOpen(true);
  };

  useEffect(() => {
    getStorageItem('user').then((u) => {
      setUser(u as any);
    });
    getCurrentUrl().then((tabURL: string | undefined) => {
      const curURL: string = tabURL ?? '';
      getAllowlist().then((allowlist) => {
        for (const regex of computeAllowlist(
          allowlist as { defaults: string[]; current: string[] }
        )) {
          if (new RegExp(regex).test(curURL)) {
            setMatched(true);
            setRegexItem(regex);
            return;
          }
        }
        setRegexItem(domainToRegex(curURL ?? '').source);
      });
    });
  }, []);

  const logout = async () => {
    await setStorageItem('user', {});
    await loggedOut();
    window.close();
  };

  return (
    <Box width={400}>
      <Toolbar>
        <IconButton edge="start" color="inherit" aria-label="logo">
          <img src="icons/32/codeium_square_logo.png" alt="Codeium" />
        </IconButton>
        <Typography variant="h6" component="div">
          Codeium
        </Typography>
        <Box sx={{ flexGrow: 1 }}>
          <IconButton
            edge="end"
            color="inherit"
            aria-label="login"
            onClick={async () => {
              console.log('user', user);
              if (user) {
                await chrome.tabs.create({ url: 'https://codeium.com/profile' });
              }
            }}
            sx={{ display: user?.name ? 'flex' : 'none', float: 'right' }}
          >
            <AccountCircleIcon />
          </IconButton>
        </Box>
      </Toolbar>
      <Typography variant="body1" component={'span'}>
        {user?.name ? (
          <Typography variant="body1" component="div">
            {`Welcome, ${user.name}`}
          </Typography>
        ) : (
          <Typography variant="body1" component="div">
            Please login
          </Typography>
        )}
      </Typography>

      <Typography variant="caption" component="div" color={matched ? 'success' : 'error'}>
        {matched ? 'Current URL matches:' : 'Adding current URL to whitelist:'}
      </Typography>

      <TextField
        label="URL"
        variant="standard"
        value={regexItem}
        onChange={(e) => setRegexItem(e.target.value)}
        fullWidth
        disabled={matched}
        InputProps={{
          readOnly: matched,
          endAdornment: !matched && (
            <IconButton onClick={addItem}>
              <SaveAltIcon />
            </IconButton>
          ),
        }}
        sx={{ marginTop: 2, marginBottom: 2 }}
      />

      <Box
        sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexDirection: 'column', gap: 1 }}
      >
        <Button
          fullWidth
          startIcon={user?.name ? <LogoutIcon /> : <LoginIcon />}
          variant="outlined"
          color="primary"
          onClick={async () => {
            if (user?.name) {
              await logout();
            } else {
              await openAuthTab();
              getStorageItem('user').then((u) => {
                setUser(u as any);
              });
            }
          }}
        >
          {user?.name ? 'Logout' : 'Login'}
        </Button>

        <Button
          fullWidth
          startIcon={<SettingsIcon />}
          variant="outlined"
          color="primary"
          onClick={async () => {
            chrome.runtime.openOptionsPage();
          }}
        >
          Options
        </Button>

        <Snackbar
          open={open}
          autoHideDuration={3000}
          onClose={() => setOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity={severity} sx={{ width: '100%' }} onClose={() => setOpen(false)}>
            {message}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
};
