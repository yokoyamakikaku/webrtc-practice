import 'https://webrtchacks.github.io/adapter/adapter-latest.js'
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.0.2/firebase-app.js'
import { collection, onSnapshot, setDoc, addDoc, doc, getFirestore, getDoc } from 'https://www.gstatic.com/firebasejs/9.0.2/firebase-firestore.js'

let localStream,
  peerConnection,
  localVideo,
  remoteVideo,
  cameraSelect,
  createRoomButton,
  joinRoomButton,
  setupMediaButton,
  roomIdInput,
  joinForm,
  joinRoomDialog,
  currentRoomId,
  roomAttributes

const firebaseConfig = {
  apiKey: 'AIzaSyCcGGTy_mIfvKBzLS8c_K-Jnl-ENdCdDQU',
  authDomain: 'webrtc-practice-a27cc.firebaseapp.com',
  projectId: 'webrtc-practice-a27cc',
  storageBucket: 'webrtc-practice-a27cc.appspot.com',
  messagingSenderId: '1006313576614',
  appId: '1:1006313576614:web:00f346c25632fa5861bc67',
  measurementId: 'G-BHJ2MESDJ8'
}

initializeApp(firebaseConfig)

const iceConfiguration = {
  iceServers: [{
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302'
    ]
  }]
}

const db = getFirestore()

async function setupMedia () {
  localStream = await getMediaStreamWithVideoDeviceId()
  localVideo.srcObject = localStream

  async function getMediaStreamWithVideoDeviceId (videoDeviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        deviceId: videoDeviceId
      }
    })
  }

  async function updateCamerSelect () {
    const devices = await navigator.mediaDevices.enumerateDevices()

    devices.filter(device => device.kind === 'videoinput')
      .forEach(camera => {
        const option = document.createElement('option')
        option.label = camera.label.replace(/\(.*\)$/, '').trim()
        option.value = camera.deviceId
        cameraSelect.add(option)
      })
  }

  navigator.mediaDevices.addEventListener('devicechange', async event => {
    cameraSelect.innerHTML = ''
    await updateCamerSelect()
  })
  updateCamerSelect()

  cameraSelect.addEventListener('change', async (event) => {
    localStream = await getMediaStreamWithVideoDeviceId(event.target.value)
    localVideo.srcObject = localStream
  })

  createRoomButton.disabled = false
  joinRoomButton.disabled = false
  setupMediaButton.disabled = true
}

async function handleIceCandidate (event, candidatesRef) {
  if (!event.candidate) return
  const candidate = await event.candidate.toJSON()
  await addDoc(candidatesRef, candidate)
}

async function handleRemoteTrack (event) {
  if (remoteVideo.srcObject === event.streams[0]) return
  remoteVideo.srcObject = event.streams[0]
}

async function createRoom () {
  createRoomButton.disabled = true
  joinRoomButton.disabled = true
  cameraSelect.disabled = true

  peerConnection = new RTCPeerConnection(iceConfiguration)

  const roomRef = await addDoc(collection(db, 'rooms'), {})
  const candidatesRef = collection(db, 'rooms', roomRef.id, 'candidates')

  const localStream = localVideo.srcObject
  localStream.getTracks().forEach(function (track) {
    peerConnection.addTrack(track, localStream)
  })

  peerConnection.addEventListener('icecandidate', event => handleIceCandidate(event, candidatesRef))
  peerConnection.addEventListener('track', handleRemoteTrack)

  onSnapshot(roomRef, async function (roomRef) {
    const data = roomRef.data()

    if (!data.answer || peerConnection.remoteDescription) return

    const remoteDescription = new RTCSessionDescription(data.answer)
    await peerConnection.setRemoteDescription(remoteDescription)
  })

  onSnapshot(candidatesRef, async function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      if (change.type !== 'added') return
      const candidate = new RTCIceCandidate(change.doc.data())
      peerConnection.addIceCandidate(candidate)
    })
  })

  const localDescription = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(localDescription)

  const { type, sdp } = localDescription
  setDoc(roomRef, { offer: { type, sdp } })

  setCurrentRoomId(roomRef.id)
  appendJoinURL(roomRef.id)
}

async function joinRoom () {
  const roomId = roomIdInput.value
  roomIdInput.value = ''

  createRoomButton.disabled = true
  joinRoomButton.disabled = true

  const peerConnection = new RTCPeerConnection(iceConfiguration)
  const roomRef = doc(db, 'rooms', roomId)
  const candidatesRef = collection(db, 'rooms', roomRef.id, 'candidates')

  setCurrentRoomId(roomId)

  const localStream = localVideo.srcObject
  localStream.getTracks().forEach(function (track) {
    peerConnection.addTrack(track, localStream)
  })

  peerConnection.addEventListener('icecandidate', event => handleIceCandidate(event, candidatesRef))
  peerConnection.addEventListener('track', handleRemoteTrack)

  const snapshot = await getDoc(roomRef)
  const data = await snapshot.data()

  const remoteDescription = new RTCSessionDescription(data.offer)
  await peerConnection.setRemoteDescription(remoteDescription)

  const localDescription = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(localDescription)

  const { type, sdp } = localDescription
  await setDoc(doc(db, 'rooms', roomRef.id), {
    answer: { type, sdp }
  }, { merge: true })
}

function startToJoinRoom () {
  const params = new URLSearchParams(location.search)
  roomIdInput.value = params.get('roomId') || ''
  joinRoomDialog.showModal()
}

function cancelToJoinRoom () {
  joinRoomDialog.close()
  roomIdInput.value = ''
}

function setCurrentRoomId (roomId) {
  currentRoomId.innerText = roomId
}

function appendJoinURL (roomId) {
  const dt = document.createElement('dt')
  const dd = document.createElement('dd')
  const anchor = document.createElement('a')

  const params = new URLSearchParams({ roomId })

  const href = `${window.location.href}${params.toString()}`

  anchor.setAttribute('target', '_blank')
  anchor.setAttribute('href', href)
  anchor.innerHTML = href

  dt.innerHTML = '入室リンク'

  roomAttributes.appendChild(dt)
  roomAttributes.appendChild(dd)
  dd.appendChild(anchor)
}

function init () {
  localVideo = document.querySelector('#localVideo')
  remoteVideo = document.querySelector('#remoteVideo')
  cameraSelect = document.querySelector('#cameraSelect')
  createRoomButton = document.querySelector('#createRoomButton')
  joinRoomButton = document.querySelector('#joinRoomButton')
  setupMediaButton = document.querySelector('#setupMediaButton')
  roomIdInput = document.querySelector('#roomIdInput')
  joinForm = document.querySelector('#joinForm')
  joinRoomDialog = document.querySelector('#joinRoomDialog')
  currentRoomId = document.querySelector('#currentRoomId')
  roomAttributes = document.querySelector('#roomAttributes')

  createRoomButton.disabled = true
  joinRoomButton.disabled = true

  setupMediaButton.addEventListener('click', setupMedia)
  createRoomButton.addEventListener('click', createRoom)
  joinRoomButton.addEventListener('click', startToJoinRoom)
  joinForm.addEventListener('reset', cancelToJoinRoom)
  joinForm.addEventListener('submit', joinRoom)
}

init()
