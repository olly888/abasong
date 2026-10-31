Pod::Spec.new do |s|
  s.name = 'AbasongOcr'
  s.version = '0.1.0'
  s.summary = 'On-device screenshot text recognition for Abasong'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Abasong'
  s.homepage = 'https://github.com/olly888/abasong'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/olly888/abasong.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
end
