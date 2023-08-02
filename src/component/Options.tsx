import LoginIcon from '@mui/icons-material/Login';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import { Alert, Button, Link, Snackbar, TextField, Typography } from '@mui/material';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import React, { createRef, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import {
  computeAllowlist,
  defaultAllowlist,
  getGeneralProfileUrl,
  getStorageItem,
  setStorageItem,
} from '../storage';

const EditableList = () => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<'success' | 'error'>('success');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const allowlist = computeAllowlist(await getStorageItem('allowlist'));
      setText(allowlist.join('\n'));
    })().catch((e) => {
      console.error(e);
    });
  }, []);

  return (
    <>
      <Typography variant="h6">Allowlist</Typography>
      <Typography variant="body2">
        Domains to allow auto-completion. Use one regex per line.
      </Typography>

      <TextField
        variant="standard"
        fullWidth
        value={text}
        multiline
        rows={10}
        sx={{
          '& .MuiInputBase-root': {
            fontSize: '0.8rem',
            fontFamily: 'monospace',
          },
        }}
        onChange={(e) => setText(e.target.value)}
      ></TextField>

      <Button
        variant="text"
        onClick={async () => {
          const lst = text
            .split('\n')
            .map((x) => x.trim())
            .filter((x) => x !== '');
          for (const rule of lst) {
            try {
              new RegExp(rule);
            } catch (e) {
              setSeverity('error');
              setMessage(`Invalid regex: ${rule}`);
              setOpen(true);
              return;
            }
          }
          await setStorageItem('allowlist', { defaults: defaultAllowlist, current: lst });
          setSeverity('success');
          setMessage('Saved successfully');
          setOpen(true);
        }}
        sx={{
          float: 'right',
          textTransform: 'none',
        }}
      >
        Save Allowlist
        <SaveAltIcon />
      </Button>

      <Button
        variant="text"
        sx={{
          float: 'right',
          textTransform: 'none',
        }}
        onClick={async () => {
          try {
            await setStorageItem('allowlist', {
              defaults: defaultAllowlist,
              current: defaultAllowlist,
            });
            setText(defaultAllowlist.join('\n'));
            setSeverity('success');
            setMessage('Reset successfully');
            setOpen(true);
          } catch (e) {
            setSeverity('error');
            setMessage((e as Error).message);
            setOpen(true);
          }
        }}
      >
        Reset Allowlist <RestartAltIcon />
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
    </>
  );
};

const openTokenPage = async () => {
  const profileUrl = await getGeneralProfileUrl();
  if (profileUrl === undefined) {
    return;
  }
  const params = new URLSearchParams({
    response_type: 'token',
    redirect_uri: 'chrome-show-auth-token',
    scope: 'openid profile email',
    prompt: 'login',
    redirect_parameters_type: 'query',
    state: uuidv4(),
  });
  await chrome.tabs.create({ url: `${profileUrl}?${params}` });
};

const Options = () => {
  const tokenRef = createRef<HTMLInputElement>();
  const portalUrlRef = createRef<HTMLInputElement>();
  const [portalUrlText, setPortalUrlText] = useState('');
  useEffect(() => {
    (async () => {
      setPortalUrlText((await getStorageItem('portalUrl')) ?? '');
    })().catch((e) => {
      console.error(e);
    });
  }, []);
  return (
    <Box sx={{ width: '100%', maxWidth: 400, bgcolor: 'background.paper' }}>
      {!CODEIUM_ENTERPRISE && (
        <>
          <Typography variant="body2">
            <SettingsIcon
              fontSize="small"
              sx={{
                verticalAlign: 'bottom',
                marginRight: '0.2em',
                marginLeft: '0.4em',
                bottom: '-0.1em',
              }}
            />{' '}
            Edit telemetry settings at the{' '}
            <Link href="https://codeium.com/profile" target="_blank">
              Codeium website
              <OpenInNewIcon
                fontSize="small"
                sx={{
                  verticalAlign: 'bottom',
                }}
              />
            </Link>
          </Typography>
          <Divider
            sx={{
              padding: '0.5em',
            }}
          />
        </>
      )}
      <Box sx={{ my: 2, mx: 2 }}>
        <Typography variant="h6"> Alternative ways to log in </Typography>
        <TextField
          id="token"
          label="Token"
          variant="standard"
          fullWidth
          type="password"
          inputRef={tokenRef}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="text" onClick={openTokenPage} sx={{ textTransform: 'none' }}>
            Get Token <OpenInNewIcon />
          </Button>

          <Button
            variant="text"
            onClick={async () => {
              // get token from input
              const token = tokenRef.current?.value;
              await chrome.runtime.sendMessage({ type: 'manual', token: token });
            }}
            sx={{ textTransform: 'none' }}
          >
            Enter Token <LoginIcon />
          </Button>
        </Box>
      </Box>
      <Divider
        sx={{
          padding: '0.5em',
        }}
      />
      <Box sx={{ my: 2, mx: 2 }}>
        <Typography variant="h6"> Enterprise settings </Typography>
        <TextField
          id="portal"
          label="Portal URL"
          variant="standard"
          fullWidth
          type="url"
          inputRef={portalUrlRef}
          value={portalUrlText}
          onChange={(e) => setPortalUrlText(e.target.value)}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="text"
            onClick={async () => {
              const portalUrl = portalUrlRef.current?.value;
              console.log(portalUrl);
              await setStorageItem('portalUrl', portalUrl);
            }}
            sx={{ textTransform: 'none' }}
          >
            Enter Portal URL <LoginIcon />
          </Button>
        </Box>
      </Box>
      <Divider
        sx={{
          padding: '0.5em',
        }}
      />
      <Box sx={{ my: 2, mx: 2 }}>
        <EditableList />
      </Box>
    </Box>
  );
};

export default Options;
