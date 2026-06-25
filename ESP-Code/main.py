#importieren der Bibliotheken
from machine import ADC, Pin
import time
import sys
import select

#Pin-Belegung
#Pins Senoren 
Bass = ADC(35)
HiHat = ADC(34)
Snare = ADC(32)
Tom = ADC(33)
#einstellen des Messbereichs
Bass.atten(ADC.ATTN_11DB)
HiHat.atten(ADC.ATTN_11DB)
Snare.atten(ADC.ATTN_11DB)
Tom.atten(ADC.ATTN_11DB)

Bass.width(ADC.WIDTH_12BIT)
HiHat.width(ADC.WIDTH_12BIT)
Snare.width(ADC.WIDTH_12BIT)
Tom.width(ADC.WIDTH_12BIT)

usb_abfrage = select.poll()
usb_abfrage.register(sys.stdin, select.POLLIN)
print("test1")
#Variablen
threshold = 5 
schlag = 0
start_zeit = time.ticks_ms()
zeit = 0
Snare2 = 0
Bass2 = 0
HiHat2 = 0
Tom2 = 0

# Neue Variablen für optimiertes Zeit-Fenster und Entprellung (Debouncing)
hit_fenster_start = 0
hit_aktiv = False
sperr_zeit = 0

print("Piezo-Ueberwachung gestartet...")
#Hauptschleife
while True:
    #Auslesen der Sensoren
    Bass1 = Bass.read()
    HiHat1 = HiHat.read()
    Snare1 = Snare.read()
    Tom1 = Tom.read()
    #Wenn Überwachung an ist (Autostart)
    if True:
        aktueller_tick = time.ticks_ms()
        #Zeit Berechnung (für CSV log)
        zeit = time.ticks_diff(aktueller_tick, start_zeit)
        zeit = zeit / 1000
        
        #Piezo abfrage (nur wenn nicht durch Debounce gesperrt)
        if (Bass1 > threshold or HiHat1 > threshold or Snare1 > threshold or Tom1 > threshold) and time.ticks_diff(aktueller_tick, sperr_zeit) >= 0:
            if not hit_aktiv:
                hit_aktiv = True
                hit_fenster_start = aktueller_tick
            
            # Alle betroffenen Trommeln in diesem winzigen 10ms-Fenster aufsammeln
            if Bass1 > threshold: 
                Bass2 = 1
            if HiHat1 > threshold: 
                HiHat2 = 1
            if Snare1 > threshold: 
                Snare2 = 1
            if Tom1 > threshold: 
                Tom2 = 1
        # Wenn Hit-Fenster aktiv ist und 3ms vergangen sind -> Senden
        if hit_aktiv and time.ticks_diff(aktueller_tick, hit_fenster_start) > 10:
            sound_parts = []
            if Snare2 == 1: sound_parts.append("snare")
            if Bass2 == 1: sound_parts.append("bass")
            if HiHat2 == 1: sound_parts.append("hihat")
            if Tom2 == 1: sound_parts.append("Tom1")
            
            sound = ", ".join(sound_parts)
            
            # Zurücksetzen der Trigger für den nächsten Schlag
            Snare2 = 0
            Bass2 = 0
            HiHat2 = 0
            Tom2 = 0
            
            if sound != "":
                csv_zeile = f"{schlag};{Bass1};{HiHat1};{Snare1};{Tom1};{zeit};{sound}\n"
                schlag = schlag + 1
                sys.stdout.write(csv_zeile)
            hit_aktiv = False
            sperr_zeit = time.ticks_add(aktueller_tick, 60)